using Pastel.Evolution;
using SageAPI.Interfaces;

namespace SageAPI.Services
{
    public class CashBookbatchService : ICashBookBatch
    {
        private readonly ISageConnection _sageConnection;
        private readonly ILogger<CashBookbatchService> _logger;

        public CashBookbatchService(ISageConnection sageConnection, ILogger<CashBookbatchService> logger)
        {
            _sageConnection = sageConnection;
          //  _logger = logger;
        }
        public void ProcessCashBookBatch(string Account, decimal credit,decimal Debit, int TaxId, DateTime Date, string Description, string Reference, string BatchNum, string Taxtype, string TaxAccount)
        {
            try
            {
                _sageConnection.LicenseInitialisation();

                CashbookBatch batch = new CashbookBatch(BatchNum);
                var detail = new CashbookBatchDetail
                {
                    Date = Date,
                    LineModule = CashbookBatchDetail.Module.Ledger,
                    Account = new GLAccount(Account),
                    Credit = (double)Debit,
                    Debit  =(double)credit,
                    Description = Description,
                    Reference = Reference,
                    TaxType = new TaxRate(Taxtype),
                    // TaxAccount = new GLAccount(TaxAccount)

                };


                batch.Detail.Add(detail);
                batch.Save();
    
            }
            catch (Exception)
            {

                throw;
            }
        }
    }
}
