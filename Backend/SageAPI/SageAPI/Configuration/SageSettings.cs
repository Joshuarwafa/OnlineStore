namespace SageAPI.Configuration
{
    /// <summary>The "Sage" section of appsettings.json, maintained from the store admin.</summary>
    public class SageSettings
    {
        public string CommonServer { get; set; } = "";
        public string CommonDatabase { get; set; } = "";
        public string CompanyServer { get; set; } = "";
        public string CompanyDatabase { get; set; } = "";
        /// <summary>The store's own database, on the same server as Sage.</summary>
        public string StagingDatabase { get; set; } = "";
        public string Username { get; set; } = "";
        /// <summary>The SQL password encrypted with Data Protection. Replaces Password once saved from the admin.</summary>
        public string? ProtectedPassword { get; set; }
        /// <summary>Plain-text password from older config files; removed the first time settings are saved.</summary>
        public string? Password { get; set; }
        public bool UseTrustedConnection { get; set; }
        public string LicenseSerial { get; set; } = "";
        public string LicenseKey { get; set; } = "";
    }
}
