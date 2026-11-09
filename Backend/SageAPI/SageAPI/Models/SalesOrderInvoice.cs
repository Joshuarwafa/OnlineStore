namespace SageAPI.Models
{
    public class SalesOrderInvoice
    {
        public string Customer { get; set; }
        public DateTime? InvoiceDate { get; set; }
        public SalesOrderAddress? DeliverTo { get; set; }
        public string? Project { get; set; }
        public List<SalesOrderInvoiceLine> Lines { get; set; } = new List<SalesOrderInvoiceLine>();

        // Everything below is optional. The online store uses it when its workflow invoices at checkout.

        /// <summary>Our own reference, e.g. the online store's order number. Shown as "Order No".</summary>
        public string? ExternalOrderNo { get; set; }
        public string? Description { get; set; }
        public string? MessageLine1 { get; set; }
        public string? MessageLine2 { get; set; }
        public string? MessageLine3 { get; set; }
        /// <summary>true when line prices include VAT; false when they exclude it; left out = Sage's default.</summary>
        public bool? PricesIncludeTax { get; set; }
    }
}
