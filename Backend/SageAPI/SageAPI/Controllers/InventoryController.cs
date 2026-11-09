using Microsoft.AspNetCore.Mvc;
using SageAPI.Interfaces;
using System.Data;

namespace SageAPI.Controllers
{
    [ApiController]
    [Route("api/Pastel")]
    public class InventoryController : ControllerBase
    {
        private readonly IInventory _inventory;

        public InventoryController(
            IInventory inventory)
        {
            _inventory = inventory;
        }

        [HttpGet("WarehouseQTY")]
        public IActionResult GetAllInventoryQuantities([FromQuery] string? warehouse)
        {
            try
            {
                DataTable result = _inventory.GetInventoryQuantities(warehouse);

                if (result.Rows.Count == 0)
                    return NotFound(new { code = 0, message = "No inventory found" });

                var inventory = new List<object>();
                foreach (DataRow row in result.Rows)
                {
                    inventory.Add(new
                    {
                        Item = row["Item"].ToString(),
                        ItemDescription = row["Item Description"].ToString(),
                        WarehouseCode = row["WarehouseCode"].ToString(),
                        WarehouseName = row["WarehouseName"].ToString(),
                        QtyOnHand = Convert.ToDouble(row["qtyOnHand"])
                    });
                }

                return Ok(new { code = 1, message = "Inventory retrieved successfully", data = inventory });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { code = 0, message = "Error retrieving inventory", error = ex.Message });
            }
        }

        [HttpGet("WarehouseQTY/{**itemCode}")]
        public IActionResult GetInventoryQuantityByItem(string itemCode, [FromQuery] string? warehouse)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(itemCode))
                    return BadRequest(new { code = 0, message = "ItemCode is required" });

                // Item codes can contain "/" (e.g. 47195/ORB), which arrives as %2F
                itemCode = Uri.UnescapeDataString(itemCode);

                DataTable result = _inventory.GetInventoryQuantityByItem(itemCode, warehouse);

                if (result.Rows.Count == 0)
                    return NotFound(new { code = 0, message = $"Item '{itemCode}' does not exist", itemCode });

                DataRow row = result.Rows[0];
                var inventory = new
                {
                    Item = row["Item"].ToString(),
                    ItemDescription = row["Item Description"].ToString(),
                    WarehouseCode = row["WarehouseCode"].ToString(),
                    WarehouseName = row["WarehouseName"].ToString(),
                    QtyOnHand = Convert.ToDouble(row["qtyOnHand"])
                };

                return Ok(new { code = 1, message = "Inventory retrieved successfully", data = inventory });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { code = 0, message = "Error retrieving inventory", error = ex.Message });
            }
        }

        [HttpGet("inventory/pricelist")]
        public IActionResult GetPriceList([FromQuery] string? priceList)
        {
            try
            {
                DataTable result = _inventory.GetPriceList(priceList);

                if (result.Rows.Count == 0)
                    return NotFound(new { code = 0, message = "No prices found" });

                var prices = new List<object>();
                foreach (DataRow row in result.Rows)
                {
                    prices.Add(new
                    {
                        ItemId = Convert.ToInt32(row["ItemId"]),
                        ItemCode = row["ItemCode"].ToString(),
                        ItemDescription = row["ItemDescription"].ToString(),
                        PriceListName = row["PriceListName"].ToString(),
                        WarehouseCode = row["WarehouseCode"].ToString(),
                        WarehouseName = row["WarehouseName"].ToString(),
                        ExclPrice = row["fExclPrice"] == DBNull.Value ? (double?)null : Convert.ToDouble(row["fExclPrice"]),
                        InclPrice = row["fInclPrice"] == DBNull.Value ? (double?)null : Convert.ToDouble(row["fInclPrice"])
                    });
                }

                return Ok(new { code = 1, message = "Prices retrieved successfully", data = prices });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { code = 0, message = "Error retrieving prices", error = ex.Message });
            }
        }

        [HttpGet("inventory/pricelist/{**itemCode}")]
        public IActionResult GetPriceListByItem(string itemCode)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(itemCode))
                    return BadRequest(new { code = 0, message = "ItemCode is required" });

                // Item codes can contain "/" (e.g. 47195/ORB), which arrives as %2F
                itemCode = Uri.UnescapeDataString(itemCode);

                DataTable result = _inventory.GetPriceListByItem(itemCode);

                if (result.Rows.Count == 0)
                    return NotFound(new { code = 0, message = $"Item '{itemCode}' does not exist", itemCode });

                var prices = new List<object>();
                foreach (DataRow row in result.Rows)
                {
                    if (row["PriceListName"] == DBNull.Value) continue;

                    prices.Add(new
                    {
                        PriceListName = row["PriceListName"].ToString(),
                        WarehouseCode = row["WarehouseCode"].ToString(),
                        WarehouseName = row["WarehouseName"].ToString(),
                        ExclPrice = row["fExclPrice"] == DBNull.Value ? (double?)null : Convert.ToDouble(row["fExclPrice"]),
                        InclPrice = row["fInclPrice"] == DBNull.Value ? (double?)null : Convert.ToDouble(row["fInclPrice"])
                    });
                }

                DataRow itemRow = result.Rows[0];
                var item = new
                {
                    ItemId = Convert.ToInt32(itemRow["ItemId"]),
                    ItemCode = itemRow["ItemCode"].ToString(),
                    ItemDescription = itemRow["ItemDescription"].ToString(),
                    Prices = prices
                };

                return Ok(new { code = 1, message = "Prices retrieved successfully", data = item });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { code = 0, message = "Error retrieving prices", error = ex.Message });
            }
        }
    }
}
