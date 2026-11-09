using System.Data;

namespace SageAPI.Interfaces
{
    public interface IAccount
    {
        DataTable GetAccount(string accountCode);

        DataTable GetAccountFromStagging(string accountCode, string Branch);

        DataTable GetAccountALLFromStagging();
    }
}
