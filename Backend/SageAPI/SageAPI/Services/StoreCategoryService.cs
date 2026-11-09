using SageAPI.Interfaces;
using SageAPI.Models;
using System.Data;
using System.Data.SqlClient;
using System.Text.RegularExpressions;

namespace SageAPI.Services
{
    /// <summary>
    /// Store categories live in the store database (OnlineStore); items come from Sage. Both are read with
    /// plain SQL, not the Sage SDK, so these calls don't have to queue behind Sage requests.
    /// Categories are one flat list (no sub-categories) and each item is in at most one category.
    /// </summary>
    public class StoreCategoryService : IStoreCategoryService
    {
        private const int MaxNameLength = 100;
        private const int MaxImportRows = 20000;

        // Active Sage items with their item-master group (WhseID -1 holds the defaults for every warehouse)
        private const string SageItemsQuery = @"
            select s.StockLink, s.Code, s.Description_1, g.Description as SageGroup
            from StkItem s
            left join _etblStockDetails d on d.StockID = s.StockLink and d.WhseID = -1
            left join GrpTbl g on g.idGrpTbl = d.GroupID
            where s.ItemActive = 1";

        // Insert or update one item's row. @setCategory = 0 leaves the category as it is; @visible null leaves visibility.
        private const string UpsertItemSql = @"
            update dbo.InventoryCategory
               set CategoryID = case when @setCategory = 1 then @categoryId else CategoryID end,
                   IsVisible  = coalesce(@visible, IsVisible),
                   ItemCode   = @itemCode,
                   UpdatedAt  = sysutcdatetime()
             where StockLink = @stockLink;
            if @@rowcount = 0
                insert into dbo.InventoryCategory (StockLink, ItemCode, CategoryID, IsVisible)
                values (@stockLink, @itemCode, case when @setCategory = 1 then @categoryId end, coalesce(@visible, 1));";

        private readonly IConnectionSettingsStore _connections;

        public StoreCategoryService(IConnectionSettingsStore connections)
        {
            _connections = connections;
        }

        // ---------------------------------------------------------------- categories

        public async Task<List<StoreCategoryDto>> GetCategoriesAsync()
        {
            await using var conn = await OpenStoreAsync();
            return await LoadCategoriesAsync(conn, null);
        }

        public async Task<StoreCategoryDto> CreateCategoryAsync(CategoryCreateInput input)
        {
            var name = CleanName(input.Name);
            await using var conn = await OpenStoreAsync();
            var categories = await LoadCategoriesAsync(conn, null);
            if (categories.Any(c => string.Equals(c.Name, name, StringComparison.OrdinalIgnoreCase)))
                throw new ArgumentException($"There is already a category called '{name}'.");

            var id = await InsertCategoryAsync(conn, null, name);
            return new StoreCategoryDto { CategoryId = id, Name = name, IsVisible = true };
        }

        public async Task<StoreCategoryDto> UpdateCategoryAsync(int categoryId, CategoryUpdateInput input)
        {
            var name = CleanName(input.Name);
            await using var conn = await OpenStoreAsync();
            var categories = await LoadCategoriesAsync(conn, null);

            var current = categories.FirstOrDefault(c => c.CategoryId == categoryId)
                ?? throw new KeyNotFoundException("That category doesn't exist any more.");
            if (categories.Any(c => c.CategoryId != categoryId && string.Equals(c.Name, name, StringComparison.OrdinalIgnoreCase)))
                throw new ArgumentException($"There is already a category called '{name}'.");

            await using (var cmd = new SqlCommand("update dbo.StoreCategory set Name = @name, IsVisible = @visible where CategoryID = @id", conn))
            {
                cmd.Parameters.Add("@name", SqlDbType.NVarChar, MaxNameLength).Value = name;
                cmd.Parameters.Add("@visible", SqlDbType.Bit).Value = input.IsVisible;
                cmd.Parameters.Add("@id", SqlDbType.Int).Value = categoryId;
                await cmd.ExecuteNonQueryAsync();
            }

            return new StoreCategoryDto { CategoryId = categoryId, Name = name, IsVisible = input.IsVisible, ItemCount = current.ItemCount };
        }

        public async Task DeleteCategoryAsync(int categoryId)
        {
            await using var conn = await OpenStoreAsync();
            // Its items fall back to "Other" (the foreign key sets their CategoryID to NULL)
            await using var cmd = new SqlCommand("delete from dbo.StoreCategory where CategoryID = @id", conn);
            cmd.Parameters.Add("@id", SqlDbType.Int).Value = categoryId;
            if (await cmd.ExecuteNonQueryAsync() == 0)
                throw new KeyNotFoundException("That category doesn't exist any more.");
        }

        // ---------------------------------------------------------------- items

        public async Task<List<StoreItemDto>> GetItemsAsync()
        {
            var items = await LoadSageItemsAsync();
            await using var conn = await OpenStoreAsync();
            var assigned = await LoadAssignmentsAsync(conn, null);

            foreach (var item in items)
            {
                if (assigned.TryGetValue(item.StockLink, out var a))
                {
                    item.CategoryId = a.CategoryId;
                    item.IsVisible = a.IsVisible;
                }
            }
            return items.OrderBy(i => i.Description, StringComparer.OrdinalIgnoreCase).ToList();
        }

        public async Task<int> UpdateItemsAsync(ItemsUpdateInput input)
        {
            if (input.StockLinks.Count == 0) throw new ArgumentException("Choose at least one item.");
            if (input.StockLinks.Count > MaxImportRows) throw new ArgumentException($"At most {MaxImportRows} items can be changed at once.");
            if (!input.SetCategory && input.IsVisible == null) throw new ArgumentException("Nothing to change.");

            var codes = (await LoadSageItemsAsync()).ToDictionary(i => i.StockLink, i => i.ItemCode);
            var missing = input.StockLinks.Where(sl => !codes.ContainsKey(sl)).ToList();
            if (missing.Count > 0) throw new ArgumentException("Some of these items are no longer active in Sage. Refresh the page and try again.");

            await using var conn = await OpenStoreAsync();
            if (input.SetCategory && input.CategoryId != null)
            {
                var categories = await LoadCategoriesAsync(conn, null);
                if (categories.All(c => c.CategoryId != input.CategoryId))
                    throw new ArgumentException("That category doesn't exist any more.");
            }

            await using var tx = (SqlTransaction)await conn.BeginTransactionAsync();
            foreach (var stockLink in input.StockLinks.Distinct())
                await UpsertItemAsync(conn, tx, stockLink, codes[stockLink], input.SetCategory, input.CategoryId, input.IsVisible);
            await tx.CommitAsync();
            return input.StockLinks.Distinct().Count();
        }

        // ---------------------------------------------------------------- upload

        public async Task<CategoryImportResult> ImportAsync(CategoryImportInput input, bool apply)
        {
            if (input.Rows.Count > MaxImportRows)
                throw new ArgumentException($"The file has {input.Rows.Count} rows; at most {MaxImportRows} can be uploaded at once.");

            var result = new CategoryImportResult();
            var sageItems = (await LoadSageItemsAsync())
                .GroupBy(i => i.ItemCode.Trim(), StringComparer.OrdinalIgnoreCase)
                .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

            await using var conn = await OpenStoreAsync();
            var categories = await LoadCategoriesAsync(conn, null);
            var assigned = await LoadAssignmentsAsync(conn, null);

            var nameToId = categories.ToDictionary(c => c.Name, c => c.CategoryId, StringComparer.OrdinalIgnoreCase);
            var idToName = categories.ToDictionary(c => c.CategoryId, c => c.Name);
            var newNames = new List<string>();
            var seenCodes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var changes = new List<(int StockLink, string ItemCode, string? Category, bool? Visible)>();

            foreach (var row in input.Rows)
            {
                var code = Clean(row.ItemCode);
                var category = Clean(row.Category);
                var show = Clean(row.Show);
                if (code == null && category == null && show == null) continue; // blank line

                result.RowsRead++;
                void Error(string message) => result.Errors.Add(new CategoryImportError { Row = row.Row, Message = message });

                if (code == null) { Error("The item code is missing."); continue; }
                if (!sageItems.TryGetValue(code, out var item)) { Error($"'{code}' isn't an active item in Sage."); continue; }
                if (category is { Length: > MaxNameLength }) { Error($"Category names can be at most {MaxNameLength} characters."); continue; }

                bool? visible = null;
                if (show != null)
                {
                    visible = ParseYesNo(show);
                    if (visible == null) { Error($"Show in store must be Yes or No, not '{show}'."); continue; }
                }

                // Only a row that passed every check claims the item, so a bad row doesn't block a good one
                if (!seenCodes.Add(code)) { Error($"'{code}' appears more than once; only its first valid row is used."); continue; }

                result.ItemsMatched++;

                if (category != null && !nameToId.ContainsKey(category) && !newNames.Contains(category, StringComparer.OrdinalIgnoreCase))
                    newNames.Add(category);

                // Items with no row yet have no category and are visible
                var (currentCategoryId, currentVisible) = assigned.TryGetValue(item.StockLink, out var saved) ? saved : (null, true);
                var currentName = currentCategoryId is int cid ? idToName.GetValueOrDefault(cid) : null;
                var categoryChanged = category != null && !string.Equals(category, currentName, StringComparison.OrdinalIgnoreCase);
                var visibilityChanged = visible != null && visible != currentVisible;

                if (categoryChanged) result.CategoryChanges++;
                if (visibilityChanged) result.VisibilityChanges++;
                if (!categoryChanged && !visibilityChanged) { result.Unchanged++; continue; }

                changes.Add((item.StockLink, item.ItemCode, categoryChanged ? category : null, visibilityChanged ? visible : null));
            }

            result.NewCategories = newNames;
            if (!apply) return result;

            await using var tx = (SqlTransaction)await conn.BeginTransactionAsync();
            foreach (var name in newNames)
                nameToId[name] = await InsertCategoryAsync(conn, tx, name);
            foreach (var change in changes)
            {
                var categoryId = change.Category != null ? nameToId[change.Category] : (int?)null;
                await UpsertItemAsync(conn, tx, change.StockLink, change.ItemCode, change.Category != null, categoryId, change.Visible);
            }
            await tx.CommitAsync();

            result.Applied = true;
            return result;
        }

        // ---------------------------------------------------------------- helpers

        private async Task<SqlConnection> OpenStoreAsync()
        {
            var conn = new SqlConnection(_connections.GetStoreConnectionString());
            await conn.OpenAsync();
            return conn;
        }

        private async Task<List<StoreItemDto>> LoadSageItemsAsync()
        {
            await using var conn = new SqlConnection(_connections.GetCompanyConnectionString());
            await conn.OpenAsync();
            await using var cmd = new SqlCommand(SageItemsQuery, conn);
            await using var reader = await cmd.ExecuteReaderAsync();
            var items = new List<StoreItemDto>();
            while (await reader.ReadAsync())
            {
                items.Add(new StoreItemDto
                {
                    StockLink = reader.GetInt32(0),
                    ItemCode = reader.GetString(1).Trim(),
                    Description = reader.IsDBNull(2) ? "" : reader.GetString(2).Trim(),
                    SageGroup = reader.IsDBNull(3) ? null : reader.GetString(3).Trim()
                });
            }
            return items;
        }

        private static async Task<List<StoreCategoryDto>> LoadCategoriesAsync(SqlConnection conn, SqlTransaction? tx)
        {
            await using var cmd = new SqlCommand(@"
                select c.CategoryID, c.Name, c.IsVisible,
                       (select count(*) from dbo.InventoryCategory i where i.CategoryID = c.CategoryID) as ItemCount
                from dbo.StoreCategory c
                order by c.Name", conn, tx);
            await using var reader = await cmd.ExecuteReaderAsync();
            var list = new List<StoreCategoryDto>();
            while (await reader.ReadAsync())
            {
                list.Add(new StoreCategoryDto
                {
                    CategoryId = reader.GetInt32(0),
                    Name = reader.GetString(1),
                    IsVisible = reader.GetBoolean(2),
                    ItemCount = reader.GetInt32(3)
                });
            }
            return list;
        }

        private static async Task<Dictionary<int, (int? CategoryId, bool IsVisible)>> LoadAssignmentsAsync(SqlConnection conn, SqlTransaction? tx)
        {
            await using var cmd = new SqlCommand("select StockLink, CategoryID, IsVisible from dbo.InventoryCategory", conn, tx);
            await using var reader = await cmd.ExecuteReaderAsync();
            var map = new Dictionary<int, (int?, bool)>();
            while (await reader.ReadAsync())
                map[reader.GetInt32(0)] = (reader.IsDBNull(1) ? null : reader.GetInt32(1), reader.GetBoolean(2));
            return map;
        }

        private static async Task<int> InsertCategoryAsync(SqlConnection conn, SqlTransaction? tx, string name)
        {
            await using var cmd = new SqlCommand("insert into dbo.StoreCategory (Name) output inserted.CategoryID values (@name)", conn, tx);
            cmd.Parameters.Add("@name", SqlDbType.NVarChar, MaxNameLength).Value = name;
            return Convert.ToInt32(await cmd.ExecuteScalarAsync());
        }

        private static async Task UpsertItemAsync(SqlConnection conn, SqlTransaction tx, int stockLink, string itemCode, bool setCategory, int? categoryId, bool? visible)
        {
            await using var cmd = new SqlCommand(UpsertItemSql, conn, tx);
            cmd.Parameters.Add("@stockLink", SqlDbType.Int).Value = stockLink;
            cmd.Parameters.Add("@itemCode", SqlDbType.NVarChar, 50).Value = itemCode.Length > 50 ? itemCode[..50] : itemCode;
            cmd.Parameters.Add("@setCategory", SqlDbType.Bit).Value = setCategory;
            cmd.Parameters.Add("@categoryId", SqlDbType.Int).Value = (object?)categoryId ?? DBNull.Value;
            cmd.Parameters.Add("@visible", SqlDbType.Bit).Value = (object?)visible ?? DBNull.Value;
            await cmd.ExecuteNonQueryAsync();
        }

        private static string CleanName(string? name)
        {
            var cleaned = Clean(name) ?? throw new ArgumentException("Enter a name.");
            if (cleaned.Length > MaxNameLength) throw new ArgumentException($"Names can be at most {MaxNameLength} characters.");
            return cleaned;
        }

        /// <summary>Trims and collapses repeated spaces; null when empty.</summary>
        private static string? Clean(string? value)
        {
            if (string.IsNullOrWhiteSpace(value)) return null;
            return Regex.Replace(value.Trim(), @"\s+", " ");
        }

        private static bool? ParseYesNo(string value) => value.ToLowerInvariant() switch
        {
            "yes" or "y" or "true" or "1" or "show" => true,
            "no" or "n" or "false" or "0" or "hide" => false,
            _ => null
        };
    }
}
