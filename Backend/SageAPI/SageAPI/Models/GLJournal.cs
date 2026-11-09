namespace SageAPI.Models
{
    public class GLJournal
    {
        public string Account { get; set; }
        public decimal Debit { get; set; }
        public decimal Credit { get; set; }
        public decimal Tax { get; set; }
        public int? TaxId { get; set; }
        public DateTime Date { get; set; }
        public string Description { get; set; }
        public string Reference { get; set; }
        public string BatchNum { get; set; }
        public string Module { get; set; }
    }
}
