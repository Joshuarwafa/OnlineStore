using SageAPI.Interfaces;
using System.Data;
using System.Data.SqlClient;

namespace SageAPI.Services
{
  
        public class DatabaseService : IDatabaseService
        {
            private readonly string _connectionString;

            public DatabaseService(string connectionString)
            {
                _connectionString = connectionString;
            }

            public void ExecuteNonQuery(string query)
            {
                using (SqlConnection conn = new SqlConnection(_connectionString))
                {
                    SqlCommand cmd = new SqlCommand(query, conn);
                    conn.Open();
                    cmd.ExecuteNonQuery();
                }
            }

            public DataTable ExecuteDataTable(string query)
            {
                DataTable dataTable = new DataTable();

                using (SqlConnection conn = new SqlConnection(_connectionString))
                {
                    using (SqlCommand cmd = new SqlCommand(query, conn))
                    {
                        conn.Open();
                        using (SqlDataAdapter adapter = new SqlDataAdapter(cmd))
                        {
                            adapter.Fill(dataTable);
                        }
                    }
                }

                return dataTable;
            }

            public object ExecuteQuery(string query)
            {
                using (SqlConnection conn = new SqlConnection(_connectionString))
                {
                    using (SqlCommand cmd = new SqlCommand(query, conn))
                    {
                        conn.Open();
                        return cmd.ExecuteScalar();
                    }
                }
            }
        
    }
}
