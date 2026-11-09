namespace SageAPI.Models
{
    /// <summary>
    /// A sales order. It is saved, not processed, so it stays open in Sage and (with ReserveStock)
    /// holds the stock until it is invoiced or cancelled. Old callers that send only Customer and
    /// Lines still work.
    /// </summary>
    public class SalesOrder : SalesDocumentRequest
    {
        /// <summary>Reserve each line's quantity in its warehouse. Default true.</summary>
        public bool ReserveStock { get; set; } = true;
    }
}
