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

        /// <summary>
        /// An open sales order. Saved, not processed: Process() would turn it into an invoice straight
        /// away, while a saved order stays open in Sage and its Reserved quantities hold the stock
        /// until it is invoiced or cancelled.
        /// </summary>
        public string ProcessSalesOrder(Models.SalesOrder Order)
        {
            Step("Connecting to Sage", () => _sageConnection.LicenseInitialisation());

            Pastel.Evolution.SalesOrder SO = new Pastel.Evolution.SalesOrder();
            Step($"Loading customer '{Order.Customer}'", () => SO.Customer = new Customer(Order.Customer));

            TaxMode taxMode = Order.PricesIncludeTax ? TaxMode.Inclusive : TaxMode.Exclusive;
            Step("Setting the document header", () =>
            {
                SO.TaxMode = taxMode;
                ApplyHeader(SO, Order.ExternalOrderNo, Order.Description, Order.MessageLine1, Order.MessageLine2, Order.MessageLine3, Order.DeliverTo);
            });

            for (int i = 0; i < Order.Lines.Count; i++)
            {
                var line = Order.Lines[i];
                string where = string.IsNullOrWhiteSpace(line.Warehouse) ? "" : $" in warehouse '{line.Warehouse}'";
                Step($"Line {i + 1}: item '{line.ItemCode}'{where}", () =>
                {
                    OrderDetail OD = new OrderDetail();
                    // Before Add: Sage refuses a line whose tax mode differs from the document's
                    // (a new line is Exclusive; the store's documents are Inclusive)
                    OD.TaxMode = taxMode;
                    SO.Detail.Add(OD);
                    OD.InventoryItem = new InventoryItem(line.ItemCode);
                    if (!string.IsNullOrWhiteSpace(line.Warehouse)) OD.Warehouse = new Warehouse(line.Warehouse);
                    OD.Quantity = line.Quantity;
                    OD.Reserved = Order.ReserveStock ? line.Quantity : 0; // quantity held for this order
                    OD.UnitSellingPrice = line.Price;
                    if (!string.IsNullOrWhiteSpace(line.Note)) OD.Note = line.Note;
                });
            }

            Step("Saving the sales order", () => SO.Save());

            return SO.OrderNo;
        }

        public string? FindByExternalOrderNo(string externalOrderNo, string type)
        {
            _sageConnection.LicenseInitialisation();
            string safe = externalOrderNo.Trim().Replace("'", "''");
            // Sales documents are DocType 4. Quotations are in the Quote state (DocState 2) and their
            // number is InvNumber (SOQ0002); an open sales order's number is its OrderNum; a processed
            // (archived, DocState 4) document carries its invoice number in InvNumber.
            string pick = type switch
            {
                "Quotation" => "InvNumber from InvNum where DocState = 2",
                "Invoice" => "InvNumber from InvNum where DocState = 4 and isnull(InvNumber, '') <> ''",
                _ => "OrderNum from InvNum where DocState <> 2 and isnull(OrderNum, '') <> ''"
            };
            DataTable rows = DatabaseContext.ExecuteCommandDataTable($@"
                select top 1 {pick.Replace(" from ", " as DocumentNo from ")}
                  and DocType = 4 and ExtOrderNum = '{safe}'
                order by AutoIndex desc");
            if (rows.Rows.Count == 0) return null;
            var no = Convert.ToString(rows.Rows[0]["DocumentNo"])?.Trim();
            return string.IsNullOrEmpty(no) ? null : no;
        }

        /// <summary>Optional header fields shared by quotations, sales orders and invoices (all sales orders in the SDK).</summary>
        private static void ApplyHeader(Pastel.Evolution.SalesOrder doc, string? externalOrderNo, string? description,
            string? message1, string? message2, string? message3, SalesOrderAddress? deliverTo)
        {
            if (!string.IsNullOrWhiteSpace(externalOrderNo)) doc.ExternalOrderNo = externalOrderNo;
            if (!string.IsNullOrWhiteSpace(description)) doc.Description = description;
            if (!string.IsNullOrWhiteSpace(message1)) doc.MessageLine1 = message1;
            if (!string.IsNullOrWhiteSpace(message2)) doc.MessageLine2 = message2;
            if (!string.IsNullOrWhiteSpace(message3)) doc.MessageLine3 = message3;

            if (deliverTo != null)
            {
                var d = deliverTo;
                doc.DeliverTo = new Address(d.Line1 ?? "", d.Line2 ?? "", d.Line3 ?? "", d.Line4 ?? "", d.Line5 ?? "", d.PostalCode ?? "");
            }
        }

        /// <summary>
        /// An invoice: built as a sales order with every line set to process in full, then processed
        /// (stock goes out, the sale is posted). Item lines or GL lines. The online store also sends its
        /// order number, message lines, a warehouse per line and VAT-inclusive prices; all optional.
        /// </summary>
        public string ProcessSalesOrderInvoice(SalesOrderInvoice Invoice)
        {
            Step("Connecting to Sage", () => _sageConnection.LicenseInitialisation());

            Pastel.Evolution.SalesOrder SO = new Pastel.Evolution.SalesOrder();
            Step($"Loading customer '{Invoice.Customer}'", () =>
            {
                SO.Customer = new Customer(Invoice.Customer);
                SO.InvoiceDate = Invoice.InvoiceDate ?? DateTime.Now;
                SO.InvoiceTo = SO.Customer.PostalAddress.Condense();
            });

            TaxMode? taxMode = Invoice.PricesIncludeTax == null ? null : Invoice.PricesIncludeTax.Value ? TaxMode.Inclusive : TaxMode.Exclusive;
            Step("Setting the document header", () =>
            {
                if (taxMode != null) SO.TaxMode = taxMode.Value;
                ApplyHeader(SO, Invoice.ExternalOrderNo, Invoice.Description, Invoice.MessageLine1, Invoice.MessageLine2, Invoice.MessageLine3, Invoice.DeliverTo);
                if (!string.IsNullOrWhiteSpace(Invoice.Project)) SO.Project = new Project(Invoice.Project);
            });

            for (int i = 0; i < Invoice.Lines.Count; i++)
            {
                var line = Invoice.Lines[i];
                string what = !string.IsNullOrWhiteSpace(line.ItemCode)
                    ? $"item '{line.ItemCode}'{(string.IsNullOrWhiteSpace(line.Warehouse) ? "" : $" in warehouse '{line.Warehouse}'")}"
                    : $"GL account '{line.GLAccount}'";
                Step($"Line {i + 1}: {what}", () =>
                {
                    OrderDetail OD = new OrderDetail();
                    // Before Add: Sage refuses a line whose tax mode differs from the document's
                    if (taxMode != null) OD.TaxMode = taxMode.Value;
                    SO.Detail.Add(OD);

                    if (!string.IsNullOrWhiteSpace(line.ItemCode))
                    {
                        OD.InventoryItem = new InventoryItem(line.ItemCode);
                        if (!string.IsNullOrWhiteSpace(line.Warehouse)) OD.Warehouse = new Warehouse(line.Warehouse);
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
                    if (!string.IsNullOrWhiteSpace(line.Note)) OD.Note = line.Note;
                });
            }

            Step("Processing the invoice", () => SO.Process());

            return SO.Reference;
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
                ApplyHeader(SOQ, Quotation.ExternalOrderNo, Quotation.Description, Quotation.MessageLine1, Quotation.MessageLine2, Quotation.MessageLine3, Quotation.DeliverTo);
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
