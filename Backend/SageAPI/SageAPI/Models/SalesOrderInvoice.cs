namespace SageAPI.Models
{
    public class SalesOrderInvoice
    {
        public string Customer { get; set; }
        public DateTime? InvoiceDate { get; set; }
        public SalesOrderAddress DeliverTo { get; set; }
        public string Project { get; set; }
        public List<SalesOrderInvoiceLine> Lines { get; set; } = new List<SalesOrderInvoiceLine>();
    }
}
