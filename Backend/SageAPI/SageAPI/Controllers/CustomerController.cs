using Microsoft.AspNetCore.Mvc;
using SageAPI.Interfaces;
using System.Data;

namespace SageAPI.Controllers
{
    [ApiController]
    [Route("api/Pastel")]
    public class CustomerController : ControllerBase
    {
        private readonly ICustomer _customer;

        public CustomerController(ICustomer customer)
        {
            _customer = customer;
        }

        [HttpGet("customers")]
        public IActionResult GetCustomers()
        {
            try
            {
                DataTable result = _customer.GetCustomers();

                if (result.Rows.Count == 0)
                    return NotFound(new { code = 0, message = "No customers found" });

                var customers = new List<object>();
                foreach (DataRow row in result.Rows)
                {
                    customers.Add(new
                    {
                        Account = row["Account"].ToString(),
                        Name = row["Name"].ToString()
                    });
                }

                return Ok(new { code = 1, message = "Customers retrieved successfully", data = customers });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { code = 0, message = "Error retrieving customers", error = ex.Message });
            }
        }
    }
}
