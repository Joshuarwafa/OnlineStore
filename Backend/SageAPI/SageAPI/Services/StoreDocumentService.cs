using SageAPI.Interfaces;
using SageAPI.Models;
using System.Data;
using System.Data.SqlClient;
using System.Text.RegularExpressions;

namespace SageAPI.Services
{
    /// <summary>
    /// The store's own record of the documents it makes in Sage (quotations, sales orders, invoices,
    /// credit notes): OnlineStore.dbo.StoreDocument (header) and dbo.StoreDocumentLine (lines),
    /// told apart by DocumentType. Plain SQL, so these calls don't queue behind Sage requests.
    /// </summary>
    public class StoreDocumentService : IStoreDocumentService
    {
        private const int MaxLines = 500;
        private const int MaxList = 500;

        private const string HeaderColumns = @"
            d.DocumentID, d.DocumentType, d.DocumentNo, d.SageDocumentNo, d.Status, d.SourceDocumentID, d.IdempotencyKey,
            d.DocumentDate, d.SageAccount, d.SageAccountName, d.CustomerName, d.CustomerPhone, d.CustomerEmail,
            d.Fulfilment, d.DeliveryAddress, d.Payment, d.BranchCode, d.BranchName, d.Message1, d.Message2, d.Message3,
            d.Currency, d.TotalExcl, d.TotalTax, d.TotalIncl, d.CreatedAt, d.UpdatedAt,
            (select count(*) from dbo.StoreDocumentLine l where l.DocumentID = d.DocumentID) as LineCount,
            d.FailReason, d.PostedAt";

        private readonly IConnectionSettingsStore _connections;

        public StoreDocumentService(IConnectionSettingsStore connections)
        {
            _connections = connections;
        }

        // ---------------------------------------------------------------- save

        public async Task<StoreDocumentSaveResult> SaveAsync(StoreDocumentInput input)
        {
            var type = StoreDocumentTypes.Parse(input.DocumentType)
                ?? throw new ArgumentException($"Document type must be one of: {string.Join(", ", StoreDocumentTypes.All)}.");
            var no = (input.DocumentNo ?? "").Trim();
            if (!Regex.IsMatch(no, @"^[A-Za-z0-9][A-Za-z0-9/_-]{0,29}$"))
                throw new ArgumentException("The document number must be 1-30 letters, digits, dashes or slashes.");
            var key = Cut(input.IdempotencyKey, 100);
            var status = input.Status == null ? "Posted" : StoreDocumentTypes.ParseStatus(input.Status);
            if (status is not ("Pending" or "Posted")) throw new ArgumentException("A new document is either Pending (not in Sage yet) or Posted.");
            input.Status = status;
            if (input.Lines.Count == 0) throw new ArgumentException("A document needs at least one line.");
            if (input.Lines.Count > MaxLines) throw new ArgumentException($"A document can have at most {MaxLines} lines.");

            var lines = input.Lines.Select((l, i) =>
            {
                var code = (l.ItemCode ?? "").Trim();
                if (code.Length == 0 || code.Length > 40) throw new ArgumentException($"Line {i + 1}: the item code is missing or too long.");
                if (l.Quantity == 0) throw new ArgumentException($"Line {i + 1}: the quantity can't be 0.");
                if (l.UnitPriceExcl < 0 || l.UnitPriceIncl < 0) throw new ArgumentException($"Line {i + 1}: prices can't be negative.");
                var excl = Math.Round(l.Quantity * l.UnitPriceExcl, 2, MidpointRounding.AwayFromZero);
                var incl = Math.Round(l.Quantity * l.UnitPriceIncl, 2, MidpointRounding.AwayFromZero);
                return new StoreDocumentLineDto
                {
                    LineNo = i + 1,
                    ItemCode = code,
                    Description = Cut(l.Description, 200),
                    Warehouse = Cut(l.Warehouse, 20),
                    Quantity = l.Quantity,
                    UnitPriceExcl = l.UnitPriceExcl,
                    UnitPriceIncl = l.UnitPriceIncl,
                    LineTotalExcl = excl,
                    LineTax = incl - excl,
                    LineTotalIncl = incl,
                    Note = Cut(l.Note, 200)
                };
            }).ToList();

            await using var conn = await OpenStoreAsync();

            // Already recorded (the same checkout sent twice, or a retry after a lost answer)
            var existing = await FindExistingAsync(conn, null, type, no, key);
            if (existing != null) return new StoreDocumentSaveResult { Existing = true, Document = (await LoadAsync(conn, existing.Value))! };

            await using var tx = (SqlTransaction)await conn.BeginTransactionAsync();
            int id;
            try
            {
                id = await InsertHeaderAsync(conn, tx, type, no, key, input, lines);
                foreach (var line in lines) await InsertLineAsync(conn, tx, id, line);
                await tx.CommitAsync();
            }
            catch (SqlException ex) when (ex.Number is 2601 or 2627)
            {
                // Another request recorded it a moment ago: return that one
                await tx.RollbackAsync();
                var raced = await FindExistingAsync(conn, null, type, no, key)
                    ?? throw new ArgumentException($"{type} {no} couldn't be recorded: {ex.Message}");
                return new StoreDocumentSaveResult { Existing = true, Document = (await LoadAsync(conn, raced))! };
            }

            return new StoreDocumentSaveResult { Existing = false, Document = (await LoadAsync(conn, id))! };
        }

        // ---------------------------------------------------------------- read

        public async Task<StoreDocumentDto?> GetAsync(string documentType, string documentNo)
        {
            var type = StoreDocumentTypes.Parse(documentType)
                ?? throw new ArgumentException($"Document type must be one of: {string.Join(", ", StoreDocumentTypes.All)}.");
            await using var conn = await OpenStoreAsync();
            await using var cmd = new SqlCommand("select DocumentID from dbo.StoreDocument where DocumentType = @type and DocumentNo = @no", conn);
            cmd.Parameters.Add("@type", SqlDbType.VarChar, 20).Value = type;
            cmd.Parameters.Add("@no", SqlDbType.NVarChar, 30).Value = (documentNo ?? "").Trim();
            var id = await cmd.ExecuteScalarAsync();
            return id is int docId ? await LoadAsync(conn, docId) : null;
        }

        public async Task<StoreDocumentDto?> SetStatusAsync(string documentType, string documentNo, StoreDocumentStatusInput input)
        {
            var type = StoreDocumentTypes.Parse(documentType)
                ?? throw new ArgumentException($"Document type must be one of: {string.Join(", ", StoreDocumentTypes.All)}.");
            var status = StoreDocumentTypes.ParseStatus(input.Status);
            // Pending again = staff are trying a failed step once more
            if (status == null) throw new ArgumentException("The new status must be Pending, Posted, Failed or Cancelled.");
            var sageNo = Cut(input.SageDocumentNo, 50);
            if (status == "Posted" && sageNo == null) throw new ArgumentException("A Posted document needs its Sage number.");
            var no = (documentNo ?? "").Trim();

            await using var conn = await OpenStoreAsync();
            await using (var cmd = new SqlCommand(@"
                update dbo.StoreDocument
                   set Status = @status,
                       SageDocumentNo = coalesce(@sageNo, SageDocumentNo),
                       FailReason = case when @status = 'Failed' then @reason else null end,
                       PostedAt = case when @status = 'Posted' then coalesce(PostedAt, sysutcdatetime()) else PostedAt end,
                       -- a failed checkout gives up its key, so pressing the button again makes a new attempt
                       IdempotencyKey = case when @status = 'Failed' then null else IdempotencyKey end,
                       UpdatedAt = sysutcdatetime()
                 where DocumentType = @type and DocumentNo = @no", conn))
            {
                cmd.Parameters.Add("@status", SqlDbType.VarChar, 20).Value = status;
                cmd.Parameters.Add("@sageNo", SqlDbType.NVarChar, 50).Value = Db(sageNo);
                cmd.Parameters.Add("@reason", SqlDbType.NVarChar, 500).Value = Db(Cut(input.FailReason, 500));
                cmd.Parameters.Add("@type", SqlDbType.VarChar, 20).Value = type;
                cmd.Parameters.Add("@no", SqlDbType.NVarChar, 30).Value = no;
                if (await cmd.ExecuteNonQueryAsync() == 0) return null;
            }
            return await GetAsync(type, no);
        }

        public async Task<List<StoreDocumentDto>> ListAsync(string? documentType, string? status, string? idempotencyKey, string? search, DateTime? from, DateTime? to, int take)
        {
            string? statusFilter = null;
            if (!string.IsNullOrWhiteSpace(status))
                statusFilter = StoreDocumentTypes.ParseStatus(status)
                    ?? throw new ArgumentException($"Status must be one of: {string.Join(", ", StoreDocumentTypes.Statuses)}.");
            string? type = null;
            if (!string.IsNullOrWhiteSpace(documentType))
                type = StoreDocumentTypes.Parse(documentType)
                    ?? throw new ArgumentException($"Document type must be one of: {string.Join(", ", StoreDocumentTypes.All)}.");
            take = Math.Clamp(take <= 0 ? 50 : take, 1, MaxList);

            await using var conn = await OpenStoreAsync();
            await using var cmd = new SqlCommand($@"
                select top (@take) {HeaderColumns}
                from dbo.StoreDocument d
                where (@type is null or d.DocumentType = @type)
                  and (@status is null or d.Status = @status)
                  and (@key is null or d.IdempotencyKey = @key)
                  and (@from is null or d.DocumentDate >= @from)
                  and (@to is null or d.DocumentDate < @to)
                  and (@search is null
                       or d.DocumentNo like @search or d.SageDocumentNo like @search
                       or d.CustomerName like @search or d.CustomerPhone like @search or d.CustomerEmail like @search)
                order by d.DocumentDate desc, d.DocumentID desc", conn);
            cmd.Parameters.Add("@take", SqlDbType.Int).Value = take;
            cmd.Parameters.Add("@type", SqlDbType.VarChar, 20).Value = (object?)type ?? DBNull.Value;
            cmd.Parameters.Add("@status", SqlDbType.VarChar, 20).Value = Db(statusFilter);
            cmd.Parameters.Add("@key", SqlDbType.NVarChar, 100).Value = (object?)Cut(idempotencyKey, 100) ?? DBNull.Value;
            cmd.Parameters.Add("@from", SqlDbType.DateTime2).Value = (object?)from ?? DBNull.Value;
            cmd.Parameters.Add("@to", SqlDbType.DateTime2).Value = (object?)to ?? DBNull.Value;
            var s = Cut(search, 100);
            cmd.Parameters.Add("@search", SqlDbType.NVarChar, 104).Value = s == null ? DBNull.Value : $"%{EscapeLike(s)}%";

            var list = new List<StoreDocumentDto>();
            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync()) list.Add(ReadHeader(reader));
            return list;
        }

        // ---------------------------------------------------------------- helpers

        private async Task<SqlConnection> OpenStoreAsync()
        {
            var conn = new SqlConnection(_connections.GetStoreConnectionString());
            await conn.OpenAsync();
            return conn;
        }

        private static async Task<int?> FindExistingAsync(SqlConnection conn, SqlTransaction? tx, string type, string no, string? key)
        {
            await using var cmd = new SqlCommand(@"
                select top 1 DocumentID from dbo.StoreDocument
                where (DocumentType = @type and DocumentNo = @no) or (@key is not null and IdempotencyKey = @key)", conn, tx);
            cmd.Parameters.Add("@type", SqlDbType.VarChar, 20).Value = type;
            cmd.Parameters.Add("@no", SqlDbType.NVarChar, 30).Value = no;
            cmd.Parameters.Add("@key", SqlDbType.NVarChar, 100).Value = (object?)key ?? DBNull.Value;
            return await cmd.ExecuteScalarAsync() is int id ? id : null;
        }

        private static async Task<int> InsertHeaderAsync(SqlConnection conn, SqlTransaction tx, string type, string no, string? key,
            StoreDocumentInput input, List<StoreDocumentLineDto> lines)
        {
            var messages = input.Messages ?? new List<string>();
            var totalExcl = lines.Sum(l => l.LineTotalExcl);
            var totalIncl = lines.Sum(l => l.LineTotalIncl);

            await using var cmd = new SqlCommand(@"
                insert into dbo.StoreDocument
                    (DocumentType, DocumentNo, SageDocumentNo, Status, SourceDocumentID, IdempotencyKey, DocumentDate,
                     SageAccount, SageAccountName, CustomerName, CustomerPhone, CustomerEmail,
                     Fulfilment, DeliveryAddress, Payment, BranchCode, BranchName, Message1, Message2, Message3,
                     Currency, TotalExcl, TotalTax, TotalIncl, PostedAt)
                output inserted.DocumentID
                values
                    (@type, @no, @sageNo, @status, @source, @key, @date,
                     @account, @accountName, @name, @phone, @email,
                     @fulfilment, @address, @payment, @branchCode, @branchName, @m1, @m2, @m3,
                     @currency, @excl, @tax, @incl, case when @status = 'Posted' then sysutcdatetime() end)", conn, tx);
            var p = cmd.Parameters;
            p.Add("@type", SqlDbType.VarChar, 20).Value = type;
            p.Add("@no", SqlDbType.NVarChar, 30).Value = no;
            p.Add("@sageNo", SqlDbType.NVarChar, 50).Value = Db(Cut(input.SageDocumentNo, 50));
            p.Add("@status", SqlDbType.VarChar, 20).Value = input.Status!;
            p.Add("@source", SqlDbType.Int).Value = (object?)input.SourceDocumentId ?? DBNull.Value;
            p.Add("@key", SqlDbType.NVarChar, 100).Value = Db(key);
            p.Add("@date", SqlDbType.DateTime2).Value = (input.DocumentDate ?? DateTime.UtcNow).ToUniversalTime();
            p.Add("@account", SqlDbType.NVarChar, 50).Value = Db(Cut(input.SageAccount, 50));
            p.Add("@accountName", SqlDbType.NVarChar, 100).Value = Db(Cut(input.SageAccountName, 100));
            p.Add("@name", SqlDbType.NVarChar, 80).Value = Db(Cut(input.CustomerName, 80));
            p.Add("@phone", SqlDbType.NVarChar, 30).Value = Db(Cut(input.CustomerPhone, 30));
            p.Add("@email", SqlDbType.NVarChar, 120).Value = Db(Cut(input.CustomerEmail, 120));
            p.Add("@fulfilment", SqlDbType.VarChar, 20).Value = Db(Cut(input.Fulfilment, 20));
            p.Add("@address", SqlDbType.NVarChar, 300).Value = Db(Cut(input.DeliveryAddress, 300));
            p.Add("@payment", SqlDbType.VarChar, 20).Value = Db(Cut(input.Payment, 20));
            p.Add("@branchCode", SqlDbType.NVarChar, 20).Value = Db(Cut(input.BranchCode, 20));
            p.Add("@branchName", SqlDbType.NVarChar, 100).Value = Db(Cut(input.BranchName, 100));
            for (var i = 0; i < 3; i++)
                p.Add($"@m{i + 1}", SqlDbType.NVarChar, 100).Value = Db(Cut(messages.ElementAtOrDefault(i), 100));
            p.Add("@currency", SqlDbType.VarChar, 10).Value = Cut(input.Currency, 10) ?? "USD";
            AddMoney(p, "@excl", totalExcl);
            AddMoney(p, "@tax", totalIncl - totalExcl);
            AddMoney(p, "@incl", totalIncl);
            return Convert.ToInt32(await cmd.ExecuteScalarAsync());
        }

        private static async Task InsertLineAsync(SqlConnection conn, SqlTransaction tx, int documentId, StoreDocumentLineDto l)
        {
            await using var cmd = new SqlCommand(@"
                insert into dbo.StoreDocumentLine
                    (DocumentID, [LineNo], ItemCode, Description, Warehouse, Quantity, UnitPriceExcl, UnitPriceIncl,
                     LineTotalExcl, LineTax, LineTotalIncl, Note)
                values (@doc, @lineNo, @code, @desc, @wh, @qty, @excl, @incl, @totalExcl, @tax, @totalIncl, @note)", conn, tx);
            var p = cmd.Parameters;
            p.Add("@doc", SqlDbType.Int).Value = documentId;
            p.Add("@lineNo", SqlDbType.Int).Value = l.LineNo;
            p.Add("@code", SqlDbType.NVarChar, 40).Value = l.ItemCode;
            p.Add("@desc", SqlDbType.NVarChar, 200).Value = Db(l.Description);
            p.Add("@wh", SqlDbType.NVarChar, 20).Value = Db(l.Warehouse);
            AddDecimal(p, "@qty", l.Quantity, 4);
            AddDecimal(p, "@excl", l.UnitPriceExcl, 4);
            AddDecimal(p, "@incl", l.UnitPriceIncl, 4);
            AddMoney(p, "@totalExcl", l.LineTotalExcl);
            AddMoney(p, "@tax", l.LineTax);
            AddMoney(p, "@totalIncl", l.LineTotalIncl);
            p.Add("@note", SqlDbType.NVarChar, 200).Value = Db(l.Note);
            await cmd.ExecuteNonQueryAsync();
        }

        private static async Task<StoreDocumentDto?> LoadAsync(SqlConnection conn, int documentId)
        {
            StoreDocumentDto? doc = null;
            await using (var cmd = new SqlCommand($"select {HeaderColumns} from dbo.StoreDocument d where d.DocumentID = @id", conn))
            {
                cmd.Parameters.Add("@id", SqlDbType.Int).Value = documentId;
                await using var reader = await cmd.ExecuteReaderAsync();
                if (await reader.ReadAsync()) doc = ReadHeader(reader);
            }
            if (doc == null) return null;

            await using (var cmd = new SqlCommand(@"
                select [LineNo], ItemCode, Description, Warehouse, Quantity, UnitPriceExcl, UnitPriceIncl,
                       LineTotalExcl, LineTax, LineTotalIncl, Note
                from dbo.StoreDocumentLine where DocumentID = @id order by [LineNo]", conn))
            {
                cmd.Parameters.Add("@id", SqlDbType.Int).Value = documentId;
                await using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    doc.Lines.Add(new StoreDocumentLineDto
                    {
                        LineNo = reader.GetInt32(0),
                        ItemCode = reader.GetString(1),
                        Description = Str(reader, 2),
                        Warehouse = Str(reader, 3),
                        Quantity = reader.GetDecimal(4),
                        UnitPriceExcl = reader.GetDecimal(5),
                        UnitPriceIncl = reader.GetDecimal(6),
                        LineTotalExcl = reader.GetDecimal(7),
                        LineTax = reader.GetDecimal(8),
                        LineTotalIncl = reader.GetDecimal(9),
                        Note = Str(reader, 10)
                    });
                }
            }
            return doc;
        }

        private static StoreDocumentDto ReadHeader(SqlDataReader r) => new()
        {
            DocumentId = r.GetInt32(0),
            DocumentType = r.GetString(1),
            DocumentNo = r.GetString(2),
            SageDocumentNo = Str(r, 3),
            Status = r.GetString(4),
            SourceDocumentId = r.IsDBNull(5) ? null : r.GetInt32(5),
            IdempotencyKey = Str(r, 6),
            DocumentDate = DateTime.SpecifyKind(r.GetDateTime(7), DateTimeKind.Utc),
            SageAccount = Str(r, 8),
            SageAccountName = Str(r, 9),
            CustomerName = Str(r, 10),
            CustomerPhone = Str(r, 11),
            CustomerEmail = Str(r, 12),
            Fulfilment = Str(r, 13),
            DeliveryAddress = Str(r, 14),
            Payment = Str(r, 15),
            BranchCode = Str(r, 16),
            BranchName = Str(r, 17),
            Messages = new[] { Str(r, 18), Str(r, 19), Str(r, 20) }.Select(m => m ?? "").ToList(),
            Currency = r.GetString(21),
            TotalExcl = r.GetDecimal(22),
            TotalTax = r.GetDecimal(23),
            TotalIncl = r.GetDecimal(24),
            CreatedAt = DateTime.SpecifyKind(r.GetDateTime(25), DateTimeKind.Utc),
            UpdatedAt = DateTime.SpecifyKind(r.GetDateTime(26), DateTimeKind.Utc),
            LineCount = r.GetInt32(27),
            FailReason = Str(r, 28),
            PostedAt = r.IsDBNull(29) ? null : DateTime.SpecifyKind(r.GetDateTime(29), DateTimeKind.Utc)
        };

        private static string? Str(SqlDataReader r, int i) => r.IsDBNull(i) ? null : r.GetString(i);

        private static object Db(string? value) => (object?)value ?? DBNull.Value;

        private static void AddMoney(SqlParameterCollection p, string name, decimal value) => AddDecimal(p, name, value, 2);

        private static void AddDecimal(SqlParameterCollection p, string name, decimal value, byte scale)
        {
            var param = p.Add(name, SqlDbType.Decimal);
            param.Precision = 18;
            param.Scale = scale;
            param.Value = Math.Round(value, scale, MidpointRounding.AwayFromZero);
        }

        /// <summary>Trimmed and cut to fit the column; null when empty. Free text is cut, never refused.</summary>
        private static string? Cut(string? value, int max)
        {
            if (string.IsNullOrWhiteSpace(value)) return null;
            var t = value.Trim();
            return t.Length > max ? t[..max] : t;
        }

        private static string EscapeLike(string s) => s.Replace("[", "[[]").Replace("%", "[%]").Replace("_", "[_]");
    }
}
