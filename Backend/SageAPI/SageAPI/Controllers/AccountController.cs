using Microsoft.AspNetCore.Mvc;
using SageAPI.Interfaces;
using System.Data;

namespace SageAPI.Controllers
{
    [ApiController]
    [Route("api/Pastel")]
    public class AccountController : ControllerBase
    {
        private readonly IAccount _account;

        public AccountController(
            IAccount account)
        {
            _account = account;
        }

        [HttpGet("Accounts")]
        public IActionResult GetAllStagingAccounts()
        {
            try
            {
                DataTable result = _account.GetAccountALLFromStagging();

                if (result.Rows.Count == 0)
                    return NotFound(new { code = 0, message = "No staging accounts found" });

                var accounts = new List<object>();
                foreach (DataRow row in result.Rows)
                {
                    accounts.Add(new
                    {
                        BankAccount = row["BankAccount"].ToString(),
                        BankBranch = row["BankBranch"].ToString(),
                        PastelAccount = row["PastelAccount"].ToString(),
                        PastelBranch = row["PastelBranch"].ToString(),
                        CbBatch = row["CbBatch"].ToString(),
                        JournalBatch = row["JournalBatch"].ToString()
                    });
                }

                return Ok(new { code = 1, message = "Accounts retrieved successfully", data = accounts });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { code = 0, message = "Error retrieving staging accounts", error = ex.Message });
            }
        }

        [HttpGet("accountenquiry/{bankAccount}/{branch}")]
        public IActionResult GetPastelAccount(string bankAccount , string Branch)
        {
            try
            {
                DataTable result = _account.GetAccountFromStagging(bankAccount,Branch);

                if (result.Rows.Count > 0)
                {
                    var accounts = new List<object>();

                    foreach (DataRow row in result.Rows)
                    {
                        accounts.Add(new
                        {
                            PastelAccount = row["PastelAccount"].ToString()
                        });
                    }

                    return Ok(new
                    {
                        code = 1,
                        message = "Account(s) found",
                        data = accounts
                    });
                }
                else
                {
                    return NotFound(new
                    {
                        code = 0,
                        message = $"No Pastel account found for Bank Account: {bankAccount}"
                    });
                }
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    code = 0,
                    message = "Error retrieving account",
                    error = ex.Message
                });
            }
        }
    }
}
