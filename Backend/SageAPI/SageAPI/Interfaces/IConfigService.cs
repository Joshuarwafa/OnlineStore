namespace SageAPI.Interfaces
{
    public interface IConfigService
    {
        string GetConnectionString(string name);
        string GetAppSetting(string key);
    }
}
