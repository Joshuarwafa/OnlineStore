namespace SageAPI.Configuration
{
    /// <summary>
    /// The database connections as shown in the store admin. Sage (company + common) and the store's
    /// staging database live on the same SQL Server and use the same SQL login.
    /// </summary>
    public class ConnectionSettings
    {
        public string Server { get; set; } = "";
        public string Username { get; set; } = "";
        public string CompanyDatabase { get; set; } = "";
        public string CommonDatabase { get; set; } = "";
        public string StagingDatabase { get; set; } = "";
    }

    /// <summary>What the API sends back. The password is never returned, only whether one is saved.</summary>
    public class ConnectionSettingsView : ConnectionSettings
    {
        public bool PasswordSet { get; set; }
    }

    /// <summary>What the admin sends. An empty password keeps the saved one.</summary>
    public class ConnectionSettingsInput : ConnectionSettings
    {
        public string? Password { get; set; }
    }

    /// <summary>Just enough to sign in to the server, e.g. to list its databases.</summary>
    public class ServerLoginInput
    {
        public string Server { get; set; } = "";
        public string Username { get; set; } = "";
        public string? Password { get; set; }
    }

    public class ConnectionTestResult
    {
        public bool Ok { get; set; }
        public string Message { get; set; } = "";
        public string? ServerVersion { get; set; }
        public List<ConnectionCheck> Checks { get; set; } = new();
    }

    public class ConnectionCheck
    {
        public string Name { get; set; } = "";
        public bool Ok { get; set; }
        public string Detail { get; set; } = "";
    }
}
