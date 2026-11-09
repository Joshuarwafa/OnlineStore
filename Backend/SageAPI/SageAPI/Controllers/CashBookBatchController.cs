using Microsoft.AspNetCore.Mvc;
using SageAPI.Interfaces;
using SageAPI.Models;

namespace SageAPI.Controllers
{
    [ApiController]
    [Route("api/Pastel")]
    public class CashBookBatchController : ControllerBase
    {
        private readonly ICashBookBatch _cashBookBatch;
        private readonly IAccount _account;

        public CashBookBatchController(
            ICashBookBatch cashBookBatch,
            IAccount account)
        {
            _cashBookBatch = cashBookBatch;
            _account = account;
        }

        [HttpPost("cashbookbatch")]
        public IActionResult PostCashBookBatch([FromBody] CashBookBatch request)
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

                if (string.IsNullOrWhiteSpace(request.Account)) errors.Add("Account is required");

                if (request.Date == default || request.Date == DateTime.MinValue) errors.Add("Date is required");

                if (string.IsNullOrWhiteSpace(request.Reference)) errors.Add("Reference is required");

                if (string.IsNullOrWhiteSpace(request.BatchNum)) errors.Add("BatchNum is required");

                if (errors.Any())
                {
                    return BadRequest(new
                    {
                        code = 0,
                        message = "Validation failed",
                        errors
                    });
                }


                var accountInfo = _account.GetAccount(request.Account);
                if (Convert.ToInt32(accountInfo.Rows[0]["RecordCount"]) == 0)
                {
                    return NotFound(new
                    {
                        code = 0,
                        message = $"Account '{request.Account}' does not exist",
                        accountCode = request.Account
                    });
                }

                _cashBookBatch.ProcessCashBookBatch(
                    request.Account,
                    request.Credit,
                    request.Debit,
                    request.TaxId ?? 0,
                    request.Date,
                    request.Description,
                    request.Reference,
                    request.BatchNum,
                    request.TaxType,
                    request.TaxAccount
                );

                return Ok(new
                {
                    code = 1,
                    message = "Cash book batch posted successfully"
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    code = 0,
                    message = "Failed to post Cash Book batch",
                    error = ex.Message
                });
            }
        }
    }
}
