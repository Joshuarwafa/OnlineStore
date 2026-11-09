using Pastel.Evolution;
using SageAPI.Interfaces;
using System.Data;

namespace SageAPI.Services
{
    public class CustomerService : ICustomer
    {
        private readonly ISageConnection _sageConnection;

        public CustomerService(ISageConnection sageConnection)
        {
            _sageConnection = sageConnection;
        }

        public DataTable GetCustomers()
        {
            _sageConnection.LicenseInitialisation();
            string qryGetCustomers = @"select Account, Name from Client";
            DataTable result = DatabaseContext.ExecuteCommandDataTable(qryGetCustomers);
            return result;
        }
    }
}
