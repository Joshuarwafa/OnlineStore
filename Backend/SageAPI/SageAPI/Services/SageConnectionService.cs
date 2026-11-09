using Microsoft.Extensions.Options;
using Pastel.Evolution;
using SageAPI.Configuration;
using SageAPI.Interfaces;

namespace SageAPI.Services
{
    public class SageConnectionService : ISageConnection
    {
        // IOptionsMonitor so settings saved from the store admin apply without a restart
        private readonly IOptionsMonitor<SageSettings> _options;
        private readonly IConnectionSettingsStore _connections;

        public SageConnectionService(IOptionsMonitor<SageSettings> options, IConnectionSettingsStore connections)
        {
            _options = options;
            _connections = connections;
        }

        public void LicenseInitialisation()
        {
            var settings = _options.CurrentValue;
            var password = _connections.GetPassword(settings);

            DatabaseContext.CreateCommonDBConnection(
                settings.CommonServer,
                settings.CommonDatabase,
                settings.Username,
                password,
                settings.UseTrustedConnection
            );

            DatabaseContext.SetLicense(
                settings.LicenseSerial,
                settings.LicenseKey
            );

            DatabaseContext.CreateConnection(
                settings.CompanyServer,
                settings.CompanyDatabase,
                settings.Username,
                password,
                settings.UseTrustedConnection
            );
        }
    }
}
