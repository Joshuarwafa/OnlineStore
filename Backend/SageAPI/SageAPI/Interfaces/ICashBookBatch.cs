namespace SageAPI.Interfaces
{
    public interface ICashBookBatch
    {
        void ProcessCashBookBatch(string Account, decimal credit,decimal Debit, int TaxId, DateTime Date, string Description, string Reference, string BatchNum,string Taxtype,string TaxAccount);
    }
}
