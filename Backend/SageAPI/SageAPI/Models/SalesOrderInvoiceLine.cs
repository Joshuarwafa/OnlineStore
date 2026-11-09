namespace SageAPI.Models
{
    public class SalesOrderInvoiceLine
    {
        /// <summary>An item line: the item code. Give either ItemCode or GLAccount.</summary>
        public string? ItemCode { get; set; }
        /// <summary>A GL line: the GL account. Give either ItemCode or GLAccount.</summary>
        public string? GLAccount { get; set; }
        public double Quantity { get; set; }
        public double? Price { get; set; }

        /// <summary>Optional Sage warehouse code for an item line, e.g. 2. Empty = the item's default warehouse.</summary>
        public string? Warehouse { get; set; }
        public string? Note { get; set; }
    }
}
