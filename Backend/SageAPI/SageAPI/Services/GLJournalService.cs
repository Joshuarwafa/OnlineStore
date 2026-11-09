using Pastel.Evolution;
using SageAPI.Interfaces;

namespace SageAPI.Services
{
    public class GLJournalService : IGLJournal
    {
        private readonly ISageConnection _sageConnection;
        private readonly ILogger<GLJournalService> _logger;

        public GLJournalService(ISageConnection sageConnection, ILogger<GLJournalService> logger)
        {
            _sageConnection = sageConnection;
            _logger = logger;
        }

        public void ProcessGLJournal(string Account, decimal debit, decimal credit, int TaxId, DateTime Date, string Description, string Reference, string BatchNum)
        {
            {

                _sageConnection.LicenseInitialisation();


                JournalBatch batch = new JournalBatch(BatchNum);
                if (debit > 0)
                {


                    var detail = new JournalBatchDetail
                    {
                        Date = Date,
                        Account = new GLAccount(Account),
                        Debit = (double)debit,
                        Description = Description,
                        Reference = Reference
                    };
                    batch.Detail.Add(detail);
                    batch.Save();
                }

                if (credit > 0)
                {

                    var creditDetail = new JournalBatchDetail
                    {
                        Date = Date,
                        Account = new GLAccount(Account),
                        Credit = (double)credit,
                        Description = Description,
                        Reference = Reference
                    };
                    // Apply tax only if supplied
                    if (TaxId > 0)
                    {
                        creditDetail.TaxRate = new TaxRate(TaxId);
                        creditDetail.Tax = creditDetail.Tax;
                        creditDetail.TaxAccount = new GLAccount("Accruals");
                    }
                    batch.Detail.Add(creditDetail);
                    batch.Save();
                }
            }


        }

        public void SaveIntoStagging(string Account, decimal Debit, decimal Credit, int TaxId, DateTime Date, string Description, string Reference, string BatchNum, string Module)
        {
            _sageConnection.LicenseInitialisation();

            // Format date to SQL Server compatible format (YYYY-MM-DD HH:MM:SS)
            string formattedDate = Date.ToString("yyyy-MM-dd HH:mm:ss");

    
            string safeAccount = Account.Replace("'", "''");
            string safeDescription = Description?.Replace("'", "''") ?? "";
            string safeReference = Reference?.Replace("'", "''") ?? "";
            string safeBatchNum = BatchNum?.Replace("'", "''") ?? "";
            string safeModule = Module.Replace("'", "''");

            string qryInsertRecord = $@"INSERT INTO ztblGLJournalStagging(
                                                                        Account,
                                                                        Debit,
                                                                        Credit,
                                                                        TaxId,
                                                                        Date,
                                                                        Description,
                                                                        Reference,
                                                                        BatchNum,
                                                                        Module
                                                                    )
                                                                    VALUES
                                                                    (
                                                                       '{safeAccount}',
                                                                        {Debit},
                                                                        {Credit},
                                                                        {TaxId},
                                                                        '{formattedDate}',
                                                                        '{safeDescription}',
                                                                        '{safeReference}',
                                                                        '{safeBatchNum}',
                                                                        '{safeModule}'
                                                                    )";

            DatabaseContext.ExecuteCommandNonQuery(qryInsertRecord);
        }
    }
}