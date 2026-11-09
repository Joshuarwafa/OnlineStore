namespace SageAPI.Models
{
    public class ARTransaction
    {
        public string Account { get; set; }
        public decimal Amount { get; set; }
        public decimal Tax { get; set; }
        public int? TaxId { get; set; }
        public DateTime Date { get; set; }
        public string Description { get; set; }
        public string Reference { get; set; }
        public string BatchNum { get; set; }
        public string ContrAccount { get; set; }
        public string TaxType { get; set; }
        public string TransactionCode { get; set; }
    }
}
