using System.Data;

namespace SageAPI.Interfaces
{
    public interface IInventory
    {
        DataTable GetInventoryQuantities(string WarehouseCode);
        DataTable GetInventoryQuantityByItem(string ItemCode, string? WarehouseCode = null);
        DataTable GetPriceList(string PriceListName);
        DataTable GetPriceListByItem(string ItemCode);
    }
}
