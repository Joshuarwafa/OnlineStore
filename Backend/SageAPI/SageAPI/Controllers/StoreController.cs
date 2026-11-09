using Microsoft.AspNetCore.Mvc;
using SageAPI.Interfaces;
using SageAPI.Models;
using SageAPI.Security;
using System.Data.SqlClient;

namespace SageAPI.Controllers
{
    /// <summary>Store data kept in the store database (categories and which items are in them).</summary>
    [ApiController]
    [ApiKey]
    [Route("api/Pastel/store")]
    public class StoreController : ControllerBase
    {
        private readonly IStoreCategoryService _categories;
        private readonly ILogger<StoreController> _logger;

        public StoreController(IStoreCategoryService categories, ILogger<StoreController> logger)
        {
            _categories = categories;
            _logger = logger;
        }

        [HttpGet("categories")]
        public Task<IActionResult> GetCategories() =>
            Run("Categories retrieved", () => _categories.GetCategoriesAsync());

        [HttpPost("categories")]
        public Task<IActionResult> CreateCategory([FromBody] CategoryCreateInput input) =>
            Run("Category created", () => _categories.CreateCategoryAsync(input));

        [HttpPut("categories/{id:int}")]
        public Task<IActionResult> UpdateCategory(int id, [FromBody] CategoryUpdateInput input) =>
            Run("Category saved", () => _categories.UpdateCategoryAsync(id, input));

        [HttpDelete("categories/{id:int}")]
        public Task<IActionResult> DeleteCategory(int id) =>
            Run("Category deleted", async () => { await _categories.DeleteCategoryAsync(id); return (object?)null; });

        [HttpGet("items")]
        public Task<IActionResult> GetItems() =>
            Run("Items retrieved", () => _categories.GetItemsAsync());

        [HttpPut("items")]
        public Task<IActionResult> UpdateItems([FromBody] ItemsUpdateInput input) =>
            Run("Items saved", async () => new { updated = await _categories.UpdateItemsAsync(input) });

        [HttpPost("categories/import/preview")]
        public Task<IActionResult> PreviewImport([FromBody] CategoryImportInput input) =>
            Run("Upload checked", () => _categories.ImportAsync(input, apply: false));

        [HttpPost("categories/import/apply")]
        public Task<IActionResult> ApplyImport([FromBody] CategoryImportInput input) =>
            Run("Upload saved", () => _categories.ImportAsync(input, apply: true));

        /// <summary>Wraps a result in the usual envelope and turns known problems into clear messages.</summary>
        private async Task<IActionResult> Run<T>(string message, Func<Task<T>> action)
        {
            try
            {
                return Ok(new { code = 1, message, data = await action() });
            }
            catch (ArgumentException ex)
            {
                return UnprocessableEntity(new { code = 0, message = ex.Message });
            }
            catch (KeyNotFoundException ex)
            {
                return NotFound(new { code = 0, message = ex.Message });
            }
            catch (InvalidOperationException ex)
            {
                // Not set up yet, e.g. no store database chosen
                return Conflict(new { code = 0, message = ex.Message });
            }
            catch (SqlException ex)
            {
                _logger.LogError(ex, "Store database error");
                var hint = ex.Number == 208
                    ? "The category tables are missing from the store database. Run Database/001_store_categories.sql."
                    : "The store database couldn't be reached. Check Maintenance → Database.";
                return StatusCode(502, new { code = 0, message = $"{hint} (Details: {ex.Message})" });
            }
        }
    }
}
