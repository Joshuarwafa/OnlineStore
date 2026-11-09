using SageAPI.Interfaces;

namespace SageAPI.Services
{
    public class ConfigService : IConfigService
    {
        private readonly IConfiguration _configuration;

        public ConfigService(IConfiguration configuration)
        {
            _configuration = configuration;
        }

        public string GetConnectionString(string name)
        {
            return _configuration.GetConnectionString(name);
        }

        public string GetAppSetting(string key)
        {
            return _configuration[key];
        }
    }
}
