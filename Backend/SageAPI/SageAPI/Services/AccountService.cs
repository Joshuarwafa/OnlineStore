using Pastel.Evolution;
using SageAPI.Interfaces;
using System.Data;

namespace SageAPI.Services
{
    public class AccountService : IAccount
    {
        private readonly ISageConnection _sageConnection;

        public AccountService(ISageConnection sageConnection)
        {
            _sageConnection = sageConnection;
        }

        public DataTable GetAccount(string Account)
        {
            _sageConnection.LicenseInitialisation();
            string safeAccount = Account.Replace("'", "''");
            string qryGetAccount = $@"select count(*) RecordCount from accounts where Master_Sub_Account='{safeAccount}'";
            DataTable Count = DatabaseContext.ExecuteCommandDataTable(qryGetAccount);
            return Count;
        }

        public DataTable GetAccountFromStagging(string Account,string Branch)
        {
            _sageConnection.LicenseInitialisation();
            string safeAccount = Account.Replace("'", "''");
            string safeBranch = Branch.Replace("'", "''");
            string qryGetAccount = $@"select PastelAccount from ztblMappingAccounts where BankAccount='{safeAccount}'and BankBranch='{safeBranch}'";
            DataTable Count = DatabaseContext.ExecuteCommandDataTable(qryGetAccount);
            return Count;
        }

        public DataTable GetAccountALLFromStagging()
        {
            _sageConnection.LicenseInitialisation();
            string qryGetAll = @"select BankAccount, BankBranch, PastelAccount, PastelBranch, CbBatch, JournalBatch from ztblMappingAccounts";
            DataTable result = DatabaseContext.ExecuteCommandDataTable(qryGetAll);
            return result;
        }
    }
}
