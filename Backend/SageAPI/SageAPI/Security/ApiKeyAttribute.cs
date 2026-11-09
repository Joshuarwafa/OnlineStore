using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using System.Security.Cryptography;
using System.Text;

namespace SageAPI.Security
{
    /// <summary>
    /// Requires the X-Api-Key header to match Security:ApiKey. Only the store backend knows the key;
    /// browsers never call SageAPI directly. Fails closed: if no key is configured, every request is refused.
    /// </summary>
    [AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
    public class ApiKeyAttribute : System.Attribute, IAsyncActionFilter
    {
        public const string HeaderName = "X-Api-Key";

        public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
        {
            var config = context.HttpContext.RequestServices.GetRequiredService<IConfiguration>();
            var expected = config["Security:ApiKey"];

            if (string.IsNullOrWhiteSpace(expected) || expected.Length < 32)
            {
                context.Result = new ObjectResult(new { code = 0, message = "SageAPI has no API key configured (Security:ApiKey, at least 32 characters)." }) { StatusCode = 503 };
                return;
            }

            if (!context.HttpContext.Request.Headers.TryGetValue(HeaderName, out var provided) ||
                !CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(provided.ToString()), Encoding.UTF8.GetBytes(expected)))
            {
                context.Result = new ObjectResult(new { code = 0, message = "A valid API key is required." }) { StatusCode = 401 };
                return;
            }

            await next();
        }
    }
}
