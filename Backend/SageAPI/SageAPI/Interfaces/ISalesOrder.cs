using SageAPI.Models;
using System.Data;

namespace SageAPI.Interfaces
{
    public interface ISalesOrder
    {
        /// <summary>Saves an open sales order (reserving stock when asked) and returns its order number.</summary>
        string ProcessSalesOrder(SalesOrder Order);

        /// <summary>Creates and processes an invoice (item or GL lines); returns the invoice number.</summary>
        string ProcessSalesOrderInvoice(SalesOrderInvoice Invoice);
        string ProcessSalesOrderQuotation(SalesOrderQuotation Quotation);

        /// <summary>
        /// The Sage number of the quotation, sales order or invoice (type) with this External Order No, or null.
        /// Lets the store check whether a document it isn't sure about was made after all.
        /// </summary>
        string? FindByExternalOrderNo(string externalOrderNo, string type);

        DataTable GetCustomer(string customerCode);
    }
}
