using Microsoft.AspNetCore.Mvc;
using SageAPI.Configuration;
using SageAPI.Interfaces;
using SageAPI.Security;

namespace SageAPI.Controllers
{
    [ApiController]
    [ApiKey]
    [Route("api/Pastel/settings")]
    public class SettingsController : ControllerBase
    {
        private readonly IConnectionSettingsStore _connections;
        private readonly ILogger<SettingsController> _logger;

        public SettingsController(IConnectionSettingsStore connections, ILogger<SettingsController> logger)
        {
            _connections = connections;
            _logger = logger;
        }

        [HttpGet("connections")]
        public IActionResult GetConnections()
        {
            return Ok(new { code = 1, message = "Connection settings retrieved", data = _connections.Get() });
        }

        [HttpPut("connections")]
        public IActionResult SaveConnections([FromBody] ConnectionSettingsInput input)
        {
            try
            {
                var saved = _connections.Save(input);
                return Ok(new { code = 1, message = "Connection settings saved", data = saved });
            }
            catch (ArgumentException ex)
            {
                return UnprocessableEntity(new { code = 0, message = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Saving connection settings failed");
                return StatusCode(500, new { code = 0, message = "The settings could not be saved. Check that SageAPI can write to appsettings.json." });
            }
        }

        [HttpPost("connections/test")]
        public async Task<IActionResult> TestConnections([FromBody] ConnectionSettingsInput input)
        {
            try
            {
                var result = await _connections.TestAsync(input);
                return Ok(new { code = 1, message = "Connection test finished", data = result });
            }
            catch (ArgumentException ex)
            {
                return UnprocessableEntity(new { code = 0, message = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Testing the connections failed");
                return StatusCode(500, new { code = 0, message = "The connection test could not run." });
            }
        }

        [HttpPost("connections/databases")]
        public async Task<IActionResult> ListDatabases([FromBody] ServerLoginInput input)
        {
            try
            {
                var names = await _connections.ListDatabasesAsync(input);
                return Ok(new { code = 1, message = "Databases retrieved", data = names });
            }
            catch (ArgumentException ex)
            {
                return UnprocessableEntity(new { code = 0, message = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Listing databases failed");
                return StatusCode(500, new { code = 0, message = "The databases could not be listed." });
            }
        }
    }
}
