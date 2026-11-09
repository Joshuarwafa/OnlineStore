using Microsoft.AspNetCore.Mvc;
using SageAPI.Interfaces;
using SageAPI.Models;
using SageAPI.Security;
using System.Data.SqlClient;

namespace SageAPI.Controllers
{
    /// <summary>Store data kept in the store database: categories, which items are in them, and the
    /// store's record of every document it makes in Sage (quotations, sales orders, invoices, credit notes).</summary>
    [ApiController]
    [ApiKey]
    [Route("api/Pastel/store")]
    public class StoreController : ControllerBase
    {
        private readonly IStoreCategoryService _categories;
        private readonly IStoreDocumentService _documents;
        private readonly ILogger<StoreController> _logger;

        public StoreController(IStoreCategoryService categories, IStoreDocumentService documents, ILogger<StoreController> logger)
        {
            _categories = categories;
            _documents = documents;
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

        // ---------------------------------------------------------------- documents

        /// <summary>Records a document and its lines. Same number or idempotency key → 200 with the existing one.</summary>
        [HttpPost("documents")]
        public async Task<IActionResult> SaveDocument([FromBody] StoreDocumentInput input)
        {
            StoreDocumentSaveResult? saved = null;
            var result = await Run("Document recorded", async () => (saved = await _documents.SaveAsync(input)).Document);
            if (saved is { Existing: false } && result is OkObjectResult ok) return StatusCode(201, ok.Value);
            return result;
        }

        /// <summary>Documents newest first, without lines. type = Quotation | SalesOrder | Invoice | CreditNote.</summary>
        [HttpGet("documents")]
        public Task<IActionResult> ListDocuments([FromQuery] string? type, [FromQuery] string? status, [FromQuery] string? key,
            [FromQuery] string? search, [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] int take = 50) =>
            Run("Documents retrieved", () => _documents.ListAsync(type, status, key, search, from, to, take));

        /// <summary>Marks a document Posted (with Sage's number), Failed (with the reason) or Cancelled.</summary>
        [HttpPut("documents/{type}/{no}/status")]
        public Task<IActionResult> SetDocumentStatus(string type, string no, [FromBody] StoreDocumentStatusInput input) =>
            Run("Document status saved", async () => await _documents.SetStatusAsync(type, no, input)
                ?? throw new KeyNotFoundException($"There is no {type} {no}."));

        /// <summary>One document with its lines, e.g. GET documents/Quotation/WEB-261106-5QF7.</summary>
        [HttpGet("documents/{type}/{no}")]
        public Task<IActionResult> GetDocument(string type, string no) =>
            Run("Document retrieved", async () => await _documents.GetAsync(type, no)
                ?? throw new KeyNotFoundException($"There is no {type} {no}."));

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
                    ? "Some store tables are missing from the store database. Run the scripts in SageAPI/Database (001, 002…) on it."
                    : "The store database couldn't be reached. Check Maintenance → Database.";
                return StatusCode(502, new { code = 0, message = $"{hint} (Details: {ex.Message})" });
            }
        }
    }
}
