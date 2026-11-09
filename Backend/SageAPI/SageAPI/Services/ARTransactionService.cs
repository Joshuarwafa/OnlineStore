using Pastel.Evolution;
using SageAPI.Interfaces;
using System.Data;

namespace SageAPI.Services
{
    public class ARTransactionService : IARTransactions
    {
        private readonly ISageConnection _sageConnection;
        private readonly ILogger<ARTransactionService> _logger;

        public ARTransactionService(ISageConnection sageConnection, ILogger<ARTransactionService> logger)
        {
            _sageConnection = sageConnection;
            //  _logger = logger;
        }
        public void ProcessARPayment(string Account, decimal Amount, int TaxId, DateTime Date, string Description, string Reference, string BatchNum, string Taxtype, string ContrAccount, string TransactionCode)
        {
            try
            {
                _sageConnection.LicenseInitialisation();

                CustomerBatch batch = new CustomerBatch(BatchNum);

                var detail = new BatchDetail
                {
                    GLAccount = new GLAccount(Account),
                    Date = Date,
                    Description = Description,
                    Reference = Reference,
                    PostDated = false,
                    TransactionCode = new TransactionCode(Module.GL, "PAY"),
                    TaxType = new TaxRate(Taxtype),
                    AmountExclusive = (double)Amount,
                    GLContraAccount = new GLAccount(ContrAccount)
                };

                batch.Detail.Add(detail);
                batch.Save();

            }
            catch (Exception)
            {

                throw;
            }
        }
        public void ProcessARPaymentForeign(string Account, decimal ForeignAmount, int TaxId, DateTime Date, string Description, string Reference, string BatchNum, string Taxtype, string ContrAccount, string TransactionCode)
        {
            try
            {
                _sageConnection.LicenseInitialisation();

                CustomerBatch batch = new CustomerBatch(BatchNum);

                var detail = new BatchDetail
                {
                    GLAccount = new GLAccount(Account),
                    Date = Date,
                    Description = Description,
                    Reference = Reference,
                    PostDated = false,
                    TransactionCode = new TransactionCode(Module.GL, "PAY"),
                    TaxType = new TaxRate(Taxtype),
                    AmountExclusiveForeign = (double)ForeignAmount,
                    GLContraAccount = new GLAccount(ContrAccount),
                  
                };

                batch.Detail.Add(detail);
                batch.Save();

            }
            catch (Exception)
            {

                throw;
            }
        }

        public DataTable GetAccount(string Account)
        {
            _sageConnection.LicenseInitialisation();
            string safeAccount = Account.Replace("'", "''");
            string qryGetAccount = $@"select iForeignBankCurrencyID,Count(*) RecordCount from Accounts where Account='{safeAccount}' group by iForeignBankCurrencyID";
            DataTable Count = DatabaseContext.ExecuteCommandDataTable(qryGetAccount);
            return Count;
        }
    }
}

