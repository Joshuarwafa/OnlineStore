using System.Data;

namespace SageAPI.Interfaces
{
    public interface IDatabaseService
    {

        void ExecuteNonQuery(string query);
        DataTable ExecuteDataTable(string query); 
        object ExecuteQuery(string query);
    }
}
