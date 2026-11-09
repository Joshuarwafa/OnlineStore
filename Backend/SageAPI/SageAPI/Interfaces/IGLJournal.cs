namespace SageAPI.Interfaces
{
    public interface IGLJournal
    {
        void ProcessGLJournal(string Account , decimal debi , decimal credit , int TaxId , DateTime Date ,string Description, string Reference, string BatchNum);

        public void SaveIntoStagging( string Account, decimal Debit,decimal Credit,int TaxId,DateTime Date,string Description,string Reference,string BatchNum,string Module);
    }
}
