using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.Options;
using SageAPI.Configuration;
using SageAPI.Interfaces;
using System.Data.SqlClient;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace SageAPI.Services
{
    /// <summary>
    /// Reads and writes the "Sage" section of appsettings.json from the store admin. The SQL password is
    /// stored encrypted (ProtectedPassword, ASP.NET Core Data Protection with DPAPI-protected keys), so the
    /// file never holds it in plain text. appsettings.json reloads on change, so no restart is needed.
    /// </summary>
    public class ConnectionSettingsStore : IConnectionSettingsStore
    {
        // The tables the store needs in its staging database
        private static readonly string[] RequiredTables = { "dbo.StoreCategory", "dbo.InventoryCategory", "dbo.StoreDocument", "dbo.StoreDocumentLine" };

        private readonly IOptionsMonitor<SageSettings> _settings;
        private readonly IDataProtector _protector;
        private readonly ILogger<ConnectionSettingsStore> _logger;
        private readonly string _path;
        private readonly object _lock = new();

        private static readonly JsonSerializerOptions WriteOptions = new()
        {
            WriteIndented = true,
            // Keep server names like JOSHUA-HP\MSSQLSERVER22 readable in the file
            Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping
        };

        public ConnectionSettingsStore(
            IOptionsMonitor<SageSettings> settings,
            IWebHostEnvironment environment,
            IDataProtectionProvider dataProtection,
            ILogger<ConnectionSettingsStore> logger)
        {
            _settings = settings;
            _protector = dataProtection.CreateProtector("SageAPI.Connections.Password.v1");
            _logger = logger;
            _path = Path.Combine(environment.ContentRootPath, "appsettings.json");
        }

        public ConnectionSettingsView Get() => ToView(_settings.CurrentValue);

        public ConnectionSettingsView Save(ConnectionSettingsInput input)
        {
            Validate(input);
            lock (_lock)
            {
                var current = _settings.CurrentValue;
                string protectedPassword;
                if (!string.IsNullOrEmpty(input.Password))
                    protectedPassword = _protector.Protect(input.Password);
                else if (!string.IsNullOrEmpty(current.ProtectedPassword))
                    protectedPassword = current.ProtectedPassword;
                else if (!string.IsNullOrEmpty(current.Password))
                    protectedPassword = _protector.Protect(current.Password); // move an old plain-text password to encrypted
                else
                    throw new ArgumentException("Enter the password.");

                var root = JsonNode.Parse(File.ReadAllText(_path), documentOptions: new JsonDocumentOptions
                {
                    CommentHandling = JsonCommentHandling.Skip,
                    AllowTrailingCommas = true
                }) as JsonObject ?? new JsonObject();

                if (root["Sage"] is not JsonObject sage)
                {
                    sage = new JsonObject();
                    root["Sage"] = sage;
                }

                var server = input.Server.Trim();
                sage["CommonServer"] = server;
                sage["CommonDatabase"] = input.CommonDatabase.Trim();
                sage["CompanyServer"] = server;
                sage["CompanyDatabase"] = input.CompanyDatabase.Trim();
                sage["StagingDatabase"] = input.StagingDatabase.Trim();
                sage["Username"] = input.Username.Trim();
                sage["ProtectedPassword"] = protectedPassword;
                sage.Remove("Password");

                // Write to a temp file first so a crash never leaves a half-written appsettings.json
                var temp = _path + ".tmp";
                File.WriteAllText(temp, root.ToJsonString(WriteOptions));
                File.Move(temp, _path, overwrite: true);

                _logger.LogInformation("Connection settings saved: {Server}, Sage {Company}/{Common}, store {Staging}, as {User}",
                    server, input.CompanyDatabase.Trim(), input.CommonDatabase.Trim(), input.StagingDatabase.Trim(), input.Username.Trim());

                // The options reload a moment after the file changes, so answer from what was written
                return new ConnectionSettingsView
                {
                    Server = server,
                    Username = input.Username.Trim(),
                    CompanyDatabase = input.CompanyDatabase.Trim(),
                    CommonDatabase = input.CommonDatabase.Trim(),
                    StagingDatabase = input.StagingDatabase.Trim(),
                    PasswordSet = true
                };
            }
        }

        public async Task<ConnectionTestResult> TestAsync(ConnectionSettingsInput input)
        {
            Validate(input);
            var password = ResolvePassword(input.Password);
            var result = new ConnectionTestResult();

            // 1. Can we sign in to the server at all?
            try
            {
                await using var conn = new SqlConnection(Build(input.Server, "master", input.Username, password));
                await conn.OpenAsync();
                await using var cmd = new SqlCommand("SELECT CAST(SERVERPROPERTY('ProductVersion') AS nvarchar(50)) + N' ' + CAST(SERVERPROPERTY('Edition') AS nvarchar(100))", conn);
                result.ServerVersion = $"SQL Server {await cmd.ExecuteScalarAsync()}";
                result.Checks.Add(new ConnectionCheck { Name = "Sign in to the server", Ok = true, Detail = $"Signed in to {input.Server.Trim()} as {input.Username.Trim()}." });
            }
            catch (SqlException ex)
            {
                result.Checks.Add(new ConnectionCheck { Name = "Sign in to the server", Ok = false, Detail = Explain(ex, input.Username, null) });
                result.Message = "Could not sign in to the server, so the databases were not checked.";
                return result;
            }

            // 2. Can the login open each database?
            await CheckDatabase(result, input, password, "Sage company database", input.CompanyDatabase, checkTables: false);
            await CheckDatabase(result, input, password, "Sage common database", input.CommonDatabase, checkTables: false);
            await CheckDatabase(result, input, password, "Store database", input.StagingDatabase, checkTables: true);

            result.Ok = result.Checks.All(c => c.Ok);
            result.Message = result.Ok ? "All connections work." : "Some checks failed. See the details below.";
            return result;
        }

        private static async Task CheckDatabase(ConnectionTestResult result, ConnectionSettingsInput input, string password, string name, string database, bool checkTables)
        {
            try
            {
                await using var conn = new SqlConnection(Build(input.Server, database, input.Username, password));
                await conn.OpenAsync();

                if (!checkTables)
                {
                    result.Checks.Add(new ConnectionCheck { Name = name, Ok = true, Detail = $"Opened {database.Trim()}." });
                    return;
                }

                var missing = new List<string>();
                foreach (var table in RequiredTables)
                {
                    await using var cmd = new SqlCommand("SELECT CASE WHEN OBJECT_ID(@name, N'U') IS NULL THEN 0 ELSE 1 END", conn);
                    cmd.Parameters.AddWithValue("@name", table);
                    if (Convert.ToInt32(await cmd.ExecuteScalarAsync()) == 0) missing.Add(table);
                }

                result.Checks.Add(missing.Count == 0
                    ? new ConnectionCheck { Name = name, Ok = true, Detail = $"Opened {database.Trim()}; the store tables are there." }
                    : new ConnectionCheck { Name = name, Ok = false, Detail = $"Opened {database.Trim()}, but these tables are missing: {string.Join(", ", missing)}." });
            }
            catch (SqlException ex)
            {
                result.Checks.Add(new ConnectionCheck { Name = name, Ok = false, Detail = Explain(ex, input.Username, database) });
            }
        }

        public async Task<List<string>> ListDatabasesAsync(ServerLoginInput input)
        {
            if (string.IsNullOrWhiteSpace(input.Server)) throw new ArgumentException("Enter the SQL Server name.");
            if (string.IsNullOrWhiteSpace(input.Username)) throw new ArgumentException("Enter the SQL login username.");
            var password = ResolvePassword(input.Password);

            try
            {
                await using var conn = new SqlConnection(Build(input.Server, "master", input.Username, password));
                await conn.OpenAsync();
                // User databases this login can see, online only
                await using var cmd = new SqlCommand("SELECT name FROM sys.databases WHERE database_id > 4 AND state = 0 ORDER BY name", conn);
                await using var reader = await cmd.ExecuteReaderAsync();
                var names = new List<string>();
                while (await reader.ReadAsync()) names.Add(reader.GetString(0));
                return names;
            }
            catch (SqlException ex)
            {
                throw new ArgumentException(Explain(ex, input.Username, null));
            }
        }

        public string GetPassword(SageSettings settings) =>
            !string.IsNullOrEmpty(settings.ProtectedPassword)
                ? _protector.Unprotect(settings.ProtectedPassword)
                : settings.Password ?? "";

        public string GetCompanyConnectionString()
        {
            var s = _settings.CurrentValue;
            if (string.IsNullOrWhiteSpace(s.CompanyServer) || string.IsNullOrWhiteSpace(s.CompanyDatabase))
                throw new InvalidOperationException("The Sage connection isn't set up yet. Go to Maintenance → Database.");
            return Build(s.CompanyServer, s.CompanyDatabase, s.Username, GetPassword(s));
        }

        public string GetStoreConnectionString()
        {
            var s = _settings.CurrentValue;
            if (string.IsNullOrWhiteSpace(s.StagingDatabase))
                throw new InvalidOperationException("The store database isn't chosen yet. Go to Maintenance → Database.");
            return Build(s.CompanyServer, s.StagingDatabase, s.Username, GetPassword(s));
        }

        private string ResolvePassword(string? typed)
        {
            if (!string.IsNullOrEmpty(typed)) return typed;
            var saved = GetPassword(_settings.CurrentValue);
            if (string.IsNullOrEmpty(saved)) throw new ArgumentException("Enter the password.");
            return saved;
        }

        private static ConnectionSettingsView ToView(SageSettings s) => new()
        {
            Server = !string.IsNullOrEmpty(s.CompanyServer) ? s.CompanyServer : s.CommonServer,
            Username = s.Username,
            CompanyDatabase = s.CompanyDatabase,
            CommonDatabase = s.CommonDatabase,
            StagingDatabase = s.StagingDatabase,
            PasswordSet = !string.IsNullOrEmpty(s.ProtectedPassword) || !string.IsNullOrEmpty(s.Password)
        };

        private static string Build(string server, string database, string username, string password)
        {
            // Builder, not string concatenation, so a ';' in a password can't inject extra settings
            var b = new SqlConnectionStringBuilder
            {
                DataSource = server.Trim(),
                InitialCatalog = database.Trim(),
                UserID = username.Trim(),
                Password = password,
                ConnectTimeout = 10,
                ApplicationName = "SageAPI"
            };
            return b.ConnectionString;
        }

        /// <summary>Plain-language hint for common SQL Server errors, followed by the original message.</summary>
        private static string Explain(SqlException ex, string username, string? database)
        {
            var hint = ex.Number switch
            {
                18456 => $"SQL Server refused the login '{username.Trim()}'. Check the username and password, and that the login exists on this server.",
                4060 => $"The login worked, but it can't open the database '{database?.Trim()}'. Check the database name and that the login has access to it.",
                233 => "The server closed the connection while signing in. Usually the username or password is wrong, or SQL Server only allows Windows sign-in (enable \"SQL Server and Windows Authentication mode\").",
                -2 => "The server didn't answer in time. Check the server name and that SQL Server is running.",
                53 or -1 or 2 => "The server couldn't be found. Check the server and instance name, that SQL Server Browser is running for named instances, and that the firewall allows it.",
                _ => null
            };
            return hint == null ? ex.Message : $"{hint} (Details: {ex.Message})";
        }

        private static void Validate(ConnectionSettings s)
        {
            if (string.IsNullOrWhiteSpace(s.Server)) throw new ArgumentException("Enter the SQL Server name.");
            if (string.IsNullOrWhiteSpace(s.Username)) throw new ArgumentException("Enter the SQL login username.");
            if (string.IsNullOrWhiteSpace(s.CompanyDatabase)) throw new ArgumentException("Enter the Sage company database.");
            if (string.IsNullOrWhiteSpace(s.CommonDatabase)) throw new ArgumentException("Enter the Sage common database.");
            if (string.IsNullOrWhiteSpace(s.StagingDatabase)) throw new ArgumentException("Enter the store database.");
            if (s.Server.Length > 256 || s.Username.Length > 128 || s.CompanyDatabase.Length > 128 ||
                s.CommonDatabase.Length > 128 || s.StagingDatabase.Length > 128)
                throw new ArgumentException("One of the values is too long.");
        }
    }
}
