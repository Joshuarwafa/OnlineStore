using Pastel.Evolution;
using SageAPI.Interfaces;
using SageAPI.Models;
using System.Data;

namespace SageAPI.Services
{
    public class SalesOrderService : ISalesOrder
    {
        private readonly ISageConnection _sageConnection;

        public SalesOrderService(ISageConnection sageConnection)
        {
            _sageConnection = sageConnection;
        }

        public string ProcessSalesOrder(string Customer, List<SalesOrderLine> Lines)
        {
            try
            {
                _sageConnection.LicenseInitialisation();

                Pastel.Evolution.SalesOrder order = new Pastel.Evolution.SalesOrder();
                order.Customer = new Customer(Customer);

                foreach (var line in Lines)
                {
                    order.Detail.Add(line.ItemCode, line.Quantity, line.Price);
                }

                order.Save();

                return order.OrderNo;
            }
            catch (Exception)
            {

                throw;
            }
        }

        public string ProcessSalesOrderInvoice(string Customer, DateTime InvoiceDate, SalesOrderAddress DeliverTo, string Project, List<SalesOrderInvoiceLine> Lines)
        {
            try
            {
                _sageConnection.LicenseInitialisation();

                Pastel.Evolution.SalesOrder SO = new Pastel.Evolution.SalesOrder();
                SO.Customer = new Customer(Customer);
                SO.InvoiceDate = InvoiceDate;
                SO.InvoiceTo = SO.Customer.PostalAddress.Condense();

                if (DeliverTo != null)
                {
                    SO.DeliverTo = new Address(DeliverTo.Line1, DeliverTo.Line2, DeliverTo.Line3, DeliverTo.Line4, DeliverTo.Line5, DeliverTo.PostalCode);
                }

                if (!string.IsNullOrWhiteSpace(Project))
                {
                    SO.Project = new Project(Project);
                }

                foreach (var line in Lines)
                {
                    OrderDetail OD = new OrderDetail();
                    SO.Detail.Add(OD);

                    if (!string.IsNullOrWhiteSpace(line.ItemCode))
                    {
                        OD.InventoryItem = new InventoryItem(line.ItemCode);
                        OD.Quantity = line.Quantity;
                        OD.ToProcess = OD.Quantity;
                        OD.UnitSellingPrice = line.Price ?? OD.InventoryItem.SellingPrices[SO.Customer.DefaultPriceList].PriceIncl;
                    }
                    else
                    {
                        OD.GLAccount = new GLAccount(line.GLAccount);
                        OD.Quantity = line.Quantity;
                        OD.ToProcess = OD.Quantity;
                        OD.UnitSellingPrice = line.Price ?? 0;
                    }
                }

                SO.Process();

                return SO.Reference;
            }
            catch (Exception)
            {

                throw;
            }
        }

        public string ProcessSalesOrderQuotation(Models.SalesOrderQuotation Quotation)
        {
            Step("Connecting to Sage", () => _sageConnection.LicenseInitialisation());

            Pastel.Evolution.SalesOrderQuotation SOQ = new Pastel.Evolution.SalesOrderQuotation();
            Step($"Loading customer '{Quotation.Customer}'", () => SOQ.Customer = new Customer(Quotation.Customer));

            TaxMode taxMode = Quotation.PricesIncludeTax ? TaxMode.Inclusive : TaxMode.Exclusive;
            Step("Setting the document header", () =>
            {
                SOQ.TaxMode = taxMode;
                if (!string.IsNullOrWhiteSpace(Quotation.ExternalOrderNo)) SOQ.ExternalOrderNo = Quotation.ExternalOrderNo;
                if (!string.IsNullOrWhiteSpace(Quotation.Description)) SOQ.Description = Quotation.Description;
                if (!string.IsNullOrWhiteSpace(Quotation.MessageLine1)) SOQ.MessageLine1 = Quotation.MessageLine1;
                if (!string.IsNullOrWhiteSpace(Quotation.MessageLine2)) SOQ.MessageLine2 = Quotation.MessageLine2;
                if (!string.IsNullOrWhiteSpace(Quotation.MessageLine3)) SOQ.MessageLine3 = Quotation.MessageLine3;

                if (Quotation.DeliverTo != null)
                {
                    var d = Quotation.DeliverTo;
                    SOQ.DeliverTo = new Address(d.Line1 ?? "", d.Line2 ?? "", d.Line3 ?? "", d.Line4 ?? "", d.Line5 ?? "", d.PostalCode ?? "");
                }
            });

            for (int i = 0; i < Quotation.Lines.Count; i++)
            {
                var line = Quotation.Lines[i];
                string where = string.IsNullOrWhiteSpace(line.Warehouse) ? "" : $" in warehouse '{line.Warehouse}'";
                Step($"Line {i + 1}: item '{line.ItemCode}'{where}", () =>
                {
                    // Let the SDK create and link the line itself (as ProcessSalesOrder does).
                    // With a warehouse, the item must be linked to that warehouse in Sage.
                    OrderDetail OD = string.IsNullOrWhiteSpace(line.Warehouse)
                        ? SOQ.Detail.Add(line.ItemCode, line.Quantity, line.Price)
                        : SOQ.Detail.Add(line.ItemCode, line.Warehouse, line.Quantity, line.Price);

                    OD.TaxMode = taxMode;
                    OD.ToProcess = OD.Quantity;
                    OD.UnitSellingPrice = line.Price;
                    if (!string.IsNullOrWhiteSpace(line.Note)) OD.Note = line.Note;
                });
            }

            Step("Saving the quotation", () => SOQ.Save());

            return string.IsNullOrWhiteSpace(SOQ.QuoteNo) ? SOQ.OrderNo : SOQ.QuoteNo;
        }

        /// <summary>
        /// Runs one step of building a Sage document. If Sage fails, the error says which step
        /// (and which item) failed, with Sage's own message, instead of a bare "Object reference not set".
        /// </summary>
        private static void Step(string what, Action action)
        {
            try
            {
                action();
            }
            catch (SageDocumentException)
            {
                throw;
            }
            catch (Exception ex)
            {
                throw new SageDocumentException(what, ex);
            }
        }

        public DataTable GetCustomer(string Customer)
        {
            _sageConnection.LicenseInitialisation();
            string safeCustomer = Customer.Replace("'", "''");
            string qryGetCustomer = $@"select count(*) RecordCount from Client where Account='{safeCustomer}'";
            DataTable Count = DatabaseContext.ExecuteCommandDataTable(qryGetCustomer);
            return Count;
        }
    }
}
