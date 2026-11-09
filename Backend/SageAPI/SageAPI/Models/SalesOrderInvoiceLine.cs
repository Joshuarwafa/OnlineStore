namespace SageAPI.Models
{
    public class SalesOrderInvoiceLine
    {
        public string ItemCode { get; set; }
        public string GLAccount { get; set; }
        public double Quantity { get; set; }
        public double? Price { get; set; }
    }
}
