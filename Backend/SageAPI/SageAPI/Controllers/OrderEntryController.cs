using Microsoft.AspNetCore.Mvc;
using SageAPI.Interfaces;
using SageAPI.Models;
using SageAPI.Services;

namespace SageAPI.Controllers
{
    [ApiController]
    [Route("api/Pastel")]
    public class OrderEntryController : ControllerBase
    {
        private readonly ISalesOrder _salesOrder;
        private readonly ILogger<OrderEntryController> _logger;

        public OrderEntryController(
            ISalesOrder salesOrder,
            ILogger<OrderEntryController> logger)
        {
            _salesOrder = salesOrder;
            _logger = logger;
        }

        /// <summary>
        /// An open sales order that holds the stock (ReserveStock, default true). It is saved, not
        /// processed, so it stays open in Sage until it is invoiced or cancelled.
        /// </summary>
        [HttpPost("salesorder")]
        public IActionResult PostSalesOrder([FromBody] SalesOrder request) =>
            SaveDocument(request, "sales order", () =>
            {
                string orderNo = _salesOrder.ProcessSalesOrder(request);
                return new { code = 1, message = "Sales order saved successfully", orderNo, data = new { orderNo } };
            });

        [HttpPost("salesorder/invoice")]
        public IActionResult PostSalesOrderInvoice([FromBody] SalesOrderInvoice request)
        {
            try
            {
                if (request == null)
                {
                    return BadRequest(new
                    {
                        code = 0,
                        message = "Request body is required"
                    });
                }


                var errors = new List<string>();

                if (string.IsNullOrWhiteSpace(request.Customer)) errors.Add("Customer is required");

                if (request.Lines == null || !request.Lines.Any()) errors.Add("At least one invoice line is required");
                else
                {
                    for (int i = 0; i < request.Lines.Count; i++)
                    {
                        var line = request.Lines[i];

                        bool hasItem = !string.IsNullOrWhiteSpace(line.ItemCode);
                        bool hasGLAccount = !string.IsNullOrWhiteSpace(line.GLAccount);

                        if (hasItem == hasGLAccount) errors.Add($"Line {i + 1}: Provide either ItemCode or GLAccount (only one)");

                        if (line.Quantity <= 0) errors.Add($"Line {i + 1}: Quantity must be greater than 0");

                        if (hasGLAccount && line.Price == null) errors.Add($"Line {i + 1}: Price is required for a GLAccount line");

                        if (line.Price < 0) errors.Add($"Line {i + 1}: Price cannot be negative");
                    }
                }

                if (errors.Any())
                {
                    return BadRequest(new
                    {
                        code = 0,
                        message = "Validation failed",
                        errors
                    });
                }


                var customerInfo = _salesOrder.GetCustomer(request.Customer);
                if (Convert.ToInt32(customerInfo.Rows[0]["RecordCount"]) == 0)
                {
                    return NotFound(new
                    {
                        code = 0,
                        message = $"Customer '{request.Customer}' does not exist",
                        customerCode = request.Customer
                    });
                }

                string invoiceNo = _salesOrder.ProcessSalesOrderInvoice(request);

                return Ok(new
                {
                    code = 1,
                    message = "Sales order invoice processed successfully",
                    invoiceNo,
                    data = new { invoiceNo }
                });
            }
            catch (SageDocumentException ex)
            {
                // Which step failed and Sage's own reasons, as for orders and quotations
                _logger.LogError(ex.InnerException, "Invoice failed at {Step}: {Reasons}", ex.Step, string.Join(" ← ", ex.Reasons));
                return StatusCode(500, new
                {
                    code = 0,
                    message = "Failed to process Sales Order invoice",
                    error = ex.Message,
                    step = ex.Step,
                    reasons = ex.Reasons,
                    sageLocation = ex.SageLocation
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Invoice failed");
                return StatusCode(500, new
                {
                    code = 0,
                    message = "Failed to process Sales Order invoice",
                    error = ex.Message
                });
            }
        }

        [HttpPost("salesorder/quotation")]
        public IActionResult PostSalesOrderQuotation([FromBody] SalesOrderQuotation request) =>
            SaveDocument(request, "quotation", () =>
            {
                string quotationNo = _salesOrder.ProcessSalesOrderQuotation(request);
                return new { code = 1, message = "Sales order quotation saved successfully", quotationNo, data = new { quotationNo } };
            });

        /// <summary>
        /// The Sage number of the quotation, sales order or invoice (type = Quotation | SalesOrder | Invoice)
        /// whose External Order No is this, e.g. GET salesorder/by-external/WEB-261109-K2VU?type=Quotation. 404 = none.
        /// </summary>
        [HttpGet("salesorder/by-external/{externalOrderNo}")]
        public IActionResult FindByExternalOrderNo(string externalOrderNo, [FromQuery] string type = "Quotation")
        {
            string[] types = { "Quotation", "SalesOrder", "Invoice" };
            string? kind = types.FirstOrDefault(t => string.Equals(t, type, StringComparison.OrdinalIgnoreCase));
            if (kind == null) return BadRequest(new { code = 0, message = "type must be Quotation, SalesOrder or Invoice" });
            try
            {
                var documentNo = _salesOrder.FindByExternalOrderNo(externalOrderNo, kind);
                return documentNo == null
                    ? NotFound(new { code = 0, message = $"No {kind} has External Order No {externalOrderNo}." })
                    : Ok(new { code = 1, message = "Found", data = new { documentNo } });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Looking up {ExternalOrderNo} failed", externalOrderNo);
                return StatusCode(500, new { code = 0, message = "Couldn't look the document up in Sage", error = ex.Message });
            }
        }

        /// <summary>Checks a quotation or sales order, checks the customer exists, then saves it in Sage.</summary>
        private IActionResult SaveDocument(SalesDocumentRequest? request, string kind, Func<object> save)
        {
            if (request == null) return BadRequest(new { code = 0, message = "Request body is required" });

            var errors = new List<string>();
            if (string.IsNullOrWhiteSpace(request.Customer)) errors.Add("Customer is required");
            if (request.Lines == null || !request.Lines.Any()) errors.Add($"At least one {kind} line is required");
            else
            {
                for (int i = 0; i < request.Lines.Count; i++)
                {
                    var line = request.Lines[i];
                    if (string.IsNullOrWhiteSpace(line.ItemCode)) errors.Add($"Line {i + 1}: ItemCode is required");
                    if (line.Quantity <= 0) errors.Add($"Line {i + 1}: Quantity must be greater than 0");
                    if (line.Price < 0) errors.Add($"Line {i + 1}: Price cannot be negative");
                }
            }
            if (errors.Any()) return BadRequest(new { code = 0, message = "Validation failed", errors });

            return RunSage(kind, () =>
            {
                var customerInfo = _salesOrder.GetCustomer(request.Customer);
                if (Convert.ToInt32(customerInfo.Rows[0]["RecordCount"]) == 0)
                    return NotFound(new { code = 0, message = $"Customer '{request.Customer}' does not exist", customerCode = request.Customer });
                return save();
            });
        }

        /// <summary>Runs a Sage document step; a failure says which step failed and Sage's own reasons.</summary>
        private IActionResult RunSage(string kind, Func<object> work)
        {
            try
            {
                var result = work();
                return result as IActionResult ?? Ok(result);
            }
            catch (SageDocumentException ex)
            {
                // Which step failed, Sage's own reasons, and where in the SDK: shown in the console and returned
                _logger.LogError(ex.InnerException, "{Kind} failed at {Step}: {Reasons}", kind, ex.Step, string.Join(" ← ", ex.Reasons));
                return StatusCode(500, new
                {
                    code = 0,
                    message = $"Failed to save the {kind}",
                    error = ex.Message,
                    step = ex.Step,
                    reasons = ex.Reasons,
                    sageLocation = ex.SageLocation
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "{Kind} failed", kind);
                return StatusCode(500, new { code = 0, message = $"Failed to save the {kind}", error = ex.Message });
            }
        }
    }

}
