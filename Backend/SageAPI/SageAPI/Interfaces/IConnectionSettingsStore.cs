using SageAPI.Configuration;

namespace SageAPI.Interfaces
{
    public interface IConnectionSettingsStore
    {
        ConnectionSettingsView Get();
        ConnectionSettingsView Save(ConnectionSettingsInput input);
        Task<ConnectionTestResult> TestAsync(ConnectionSettingsInput input);
        Task<List<string>> ListDatabasesAsync(ServerLoginInput input);

        /// <summary>The SQL password for these settings, decrypted in memory.</summary>
        string GetPassword(SageSettings settings);

        /// <summary>Plain SQL access to the Sage company database (for reads that don't need the Sage SDK).</summary>
        string GetCompanyConnectionString();

        /// <summary>The store's own database. Throws InvalidOperationException if none is chosen yet.</summary>
        string GetStoreConnectionString();
    }
}
