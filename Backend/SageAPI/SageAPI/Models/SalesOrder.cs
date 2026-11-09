namespace SageAPI.Models
{
    public class SalesOrder
    {
        public string Customer { get; set; }
        public List<SalesOrderLine> Lines { get; set; } = new List<SalesOrderLine>();
    }
}
