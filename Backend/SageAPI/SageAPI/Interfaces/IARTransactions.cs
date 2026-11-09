using System.Data;

namespace SageAPI.Interfaces
{
    public interface IARTransactions
    {
        void ProcessARPayment(string Account, decimal Amount, int TaxId, DateTime Date, string Description, string Reference, string BatchNum, string Taxtype, string ContrAccount,String TransactionCode);
        void ProcessARPaymentForeign(string Account, decimal ForeignAmount, int TaxId, DateTime Date, string Description, string Reference, string BatchNum, string Taxtype, string ContrAccount, String TransactionCode);
        DataTable GetAccount(string accountCode);
    }
}
