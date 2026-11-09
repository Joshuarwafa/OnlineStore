using System.Data;

namespace SageAPI.Interfaces
{
    public interface ICustomer
    {
        /// <summary>All customers (Account, Name).</summary>
        DataTable GetCustomers();
    }
}
