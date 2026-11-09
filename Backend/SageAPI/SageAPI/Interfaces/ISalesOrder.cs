using SageAPI.Models;
using System.Data;

namespace SageAPI.Interfaces
{
    public interface ISalesOrder
    {
        string ProcessSalesOrder(string Customer, List<SalesOrderLine> Lines);
        string ProcessSalesOrderInvoice(string Customer, DateTime InvoiceDate, SalesOrderAddress DeliverTo, string Project, List<SalesOrderInvoiceLine> Lines);
        string ProcessSalesOrderQuotation(SalesOrderQuotation Quotation);
        DataTable GetCustomer(string customerCode);
    }
}
