using Pastel.Evolution;
using SageAPI.Interfaces;
using System.Data;

namespace SageAPI.Services
{
    public class InventoryService : IInventory
    {
        private readonly ISageConnection _sageConnection;

        private const string qryInventory = @"select	s.Code						[Item]
		                                        ,s.Description_1			[Item Description]
		                                        ,w.Code						WarehouseCode
		                                        ,w.Name						WarehouseName
		                                        ,isnull(sum(st.qtyOnHand),0)	qtyOnHand
		                                        ,isnull(sum(st.QtyReserved),0)	qtyReserved

		                                        from
                                        StkItem s
                                        left join _etblStockQtys st on s.StockLink=st.StockID
                                        left join  WhseMst w on st.WhseID=w.WhseLink";

        // _etblStockQtys holds one row per lot for lot-tracked items, so lots are added up to give
        // one row per item per warehouse. Goes after any where clause.
        private const string qryInventoryGroupBy = @"
                                        group by s.Code, s.Description_1, w.Code, w.Name";

        private const string qryPriceList = @"SELECT
                                            s.StockLink              AS ItemId,
                                            s.Code                   AS ItemCode,
                                            s.Description_1          AS ItemDescription,
                                            pl.cName                 AS PriceListName,
                                            w.Code                   AS WarehouseCode,
                                            w.Name                   AS WarehouseName,
                                            P.fExclPrice             AS fExclPrice,
                                            P.fInclPrice             AS fInclPrice
                                        FROM StkItem s
                                        Left Join _etblPriceListPrices P on s.StockLink=P.iStockID
                                        left join _etblPriceListName pl on pl.IDPriceListName = P.iPriceListNameID
                                        left JOIN WhseMst w        ON w.WhseLink = P.iWarehouseID";

        public InventoryService(ISageConnection sageConnection)
        {
            _sageConnection = sageConnection;
        }

        public DataTable GetInventoryQuantities(string WarehouseCode)
        {
            _sageConnection.LicenseInitialisation();

            string qryGetInventory = qryInventory;

            if (!string.IsNullOrWhiteSpace(WarehouseCode))
            {
                string safeWarehouseCode = WarehouseCode.Replace("'", "''");
                qryGetInventory += $@"
                                        where  w.Code ='{safeWarehouseCode}'";
            }

            qryGetInventory += qryInventoryGroupBy;
            DataTable result = DatabaseContext.ExecuteCommandDataTable(qryGetInventory);
            return result;
        }

        public DataTable GetInventoryQuantityByItem(string ItemCode, string? WarehouseCode = null)
        {
            _sageConnection.LicenseInitialisation();

            string safeItemCode = ItemCode.Replace("'", "''");
            string qryGetInventory = qryInventory + $@"
                                        where  s.Code ='{safeItemCode}'";

            // Optional: only this warehouse's stock (the online store sells from one warehouse)
            if (!string.IsNullOrWhiteSpace(WarehouseCode))
            {
                string safeWarehouseCode = WarehouseCode.Replace("'", "''");
                qryGetInventory += $@"
                                        and    w.Code ='{safeWarehouseCode}'";
            }

            qryGetInventory += qryInventoryGroupBy;
            DataTable result = DatabaseContext.ExecuteCommandDataTable(qryGetInventory);
            return result;
        }

        public DataTable GetPriceList(string PriceListName)
        {
            _sageConnection.LicenseInitialisation();

            string qryGetPriceList = qryPriceList;

            if (!string.IsNullOrWhiteSpace(PriceListName))
            {
                string safePriceListName = PriceListName.Replace("'", "''");
                qryGetPriceList += $@"
                                        where  pl.cName ='{safePriceListName}'";
            }

            DataTable result = DatabaseContext.ExecuteCommandDataTable(qryGetPriceList);
            return result;
        }

        public DataTable GetPriceListByItem(string ItemCode)
        {
            _sageConnection.LicenseInitialisation();

            string safeItemCode = ItemCode.Replace("'", "''");
            string qryGetPriceList = qryPriceList + $@"
                                        where  s.Code ='{safeItemCode}'";

            DataTable result = DatabaseContext.ExecuteCommandDataTable(qryGetPriceList);
            return result;
        }
    }
}
