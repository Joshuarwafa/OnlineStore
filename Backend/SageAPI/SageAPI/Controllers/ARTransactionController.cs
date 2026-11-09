using Microsoft.AspNetCore.Mvc;
using SageAPI.Interfaces;
using SageAPI.Models;

namespace SageAPI.Controllers
{
    [ApiController]
    [Route("api/Pastel")]
    public class ARTransactionController : ControllerBase
    {
        private readonly IARTransactions _ARTransaction;

        public ARTransactionController(
            IARTransactions aRTransaction)
        {
            _ARTransaction = aRTransaction;
        }

        [HttpPost("ARTransaction")]
        public IActionResult PostCustomerTransaction([FromBody] ARTransaction request)
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

                var accountInfo = _ARTransaction.GetAccount(request.Account);

                if (Convert.ToInt32(accountInfo.Rows[0]["RecordCount"]) == 0)
                {
                    return NotFound(new
                    {
                        code = 0,
                        message = $"Account '{request.Account}' does not exist",
                        accountCode = request.Account
                    });
                }
                bool isForeignAccount = Convert.ToInt32(accountInfo.Rows[0]["iForeignBankCurrencyID"]) == 1;

                if (isForeignAccount)
                {
                    _ARTransaction.ProcessARPaymentForeign(
                    request.Account,
                    request.Amount,
                    request.TaxId ?? 0,
                    request.Date,
                    request.Description,
                    request.Reference,
                    request.BatchNum,
                    request.TaxType,
                    request.ContrAccount,
                    request.TransactionCode
                );
                }
                else
                {

                    _ARTransaction.ProcessARPayment(
                           request.Account,
                        request.Amount,
                        request.TaxId ?? 0,
                        request.Date,
                        request.Description,
                        request.Reference,
                        request.BatchNum,
                        request.TaxType,
                        request.ContrAccount,
                        request.TransactionCode
                    );
                }

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
