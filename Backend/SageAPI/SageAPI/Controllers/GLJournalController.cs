using Microsoft.AspNetCore.Mvc;
using SageAPI.Interfaces;
using SageAPI.Models;

namespace SageAPI.Controllers
{
    [ApiController]
    [Route("api/Pastel")]
    public class GLJournalController : ControllerBase
    {
        private readonly IGLJournal _glJournal;
        private readonly IAccount _account;

        public GLJournalController(
            IGLJournal glJournal,
            IAccount account)
        {
            _glJournal = glJournal;
            _account = account;
        }

        [HttpPost("gljournal/temp")]
        public IActionResult SaveTempGLJournal([FromBody] GLJournal request)
        {
            try
            {
                if (request == null)
                    return BadRequest(new { code = 0, message = "Request body is required" });


                var errors = new List<string>();

                if (string.IsNullOrWhiteSpace(request.Account))  errors.Add("Account is required");

                if (request.Date == default || request.Date == DateTime.MinValue) errors.Add("Date is required");

                if (string.IsNullOrWhiteSpace(request.Reference))  errors.Add("Reference is required");

                if (string.IsNullOrWhiteSpace(request.BatchNum)) errors.Add("BatchNum is required");

                if (errors.Any())
                    return BadRequest(new { code = 0, message = "Validation failed", errors });
 

                var accountInfo = _account.GetAccount(request.Account);
                if (Convert.ToInt32(accountInfo.Rows[0]["RecordCount"]) == 0)
                    return NotFound(new { code = 0, message = $"Account '{request.Account}' does not exist" });

                _glJournal.SaveIntoStagging(
                    request.Account,
                    request.Debit,
                    request.Credit,
                    request.TaxId ?? 0,
                    request.Date,
                    request.Description,
                    request.Reference,
                    request.BatchNum,
                    "GL"
                );

                return Ok(new { code = 1, message = "GL Journal line saved temporarily" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { code = 0, message = "Failed to save GL Journal", error = ex.Message });
            }
        }


        [HttpPost("gljournal")]
        public IActionResult PostGLJournal([FromBody] GLJournal request)
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

                if (string.IsNullOrWhiteSpace(request.Reference))errors.Add("Reference is required");

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

                _glJournal.ProcessGLJournal(
                    request.Account,
                    request.Debit,
                    request.Credit,
                    request.TaxId ?? 0,
                    request.Date,
                    request.Description,
                    request.Reference,
                    request.BatchNum
                );

                return Ok(new
                {
                    code = 1,
                    message = "GL Journal posted successfully"
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    code = 0,
                    message = "Failed to post GL Journal",
                    error = ex.Message
                });
            }
        }
    }
}
