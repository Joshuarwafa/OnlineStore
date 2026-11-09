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

        [HttpPost("salesorder")]
        public IActionResult PostSalesOrder([FromBody] SalesOrder request)
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

                if (request.Lines == null || !request.Lines.Any()) errors.Add("At least one order line is required");
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

                string orderNo = _salesOrder.ProcessSalesOrder(
                    request.Customer,
                    request.Lines
                );

                return Ok(new
                {
                    code = 1,
                    message = "Sales order placed successfully",
                    orderNo
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    code = 0,
                    message = "Failed to place Sales Order",
                    error = ex.Message
                });
            }
        }

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

                string invoiceNo = _salesOrder.ProcessSalesOrderInvoice(
                    request.Customer,
                    request.InvoiceDate ?? DateTime.Now,
                    request.DeliverTo,
                    request.Project,
                    request.Lines
                );

                return Ok(new
                {
                    code = 1,
                    message = "Sales order invoice processed successfully",
                    invoiceNo
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    code = 0,
                    message = "Failed to process Sales Order invoice",
                    error = ex.Message
                });
            }
        }

        [HttpPost("salesorder/quotation")]
        public IActionResult PostSalesOrderQuotation([FromBody] SalesOrderQuotation request)
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

                if (request.Lines == null || !request.Lines.Any()) errors.Add("At least one quotation line is required");
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

                string quotationNo = _salesOrder.ProcessSalesOrderQuotation(request);

                return Ok(new
                {
                    code = 1,
                    message = "Sales order quotation saved successfully",
                    quotationNo,
                    data = new { quotationNo }
                });
            }
            catch (SageDocumentException ex)
            {
                // Which step failed, Sage's own reasons, and where in the SDK: shown in the console and returned
                _logger.LogError(ex.InnerException, "Quotation failed at {Step}: {Reasons}", ex.Step, string.Join(" ← ", ex.Reasons));
                return StatusCode(500, new
                {
                    code = 0,
                    message = "Failed to save Sales Order quotation",
                    error = ex.Message,
                    step = ex.Step,
                    reasons = ex.Reasons,
                    sageLocation = ex.SageLocation
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Quotation failed");
                return StatusCode(500, new
                {
                    code = 0,
                    message = "Failed to save Sales Order quotation",
                    error = ex.Message
                });
            }
        }
    }
}
