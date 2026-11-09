using SageAPI.Models;

namespace SageAPI.Interfaces
{
    public interface IStoreDocumentService
    {
        /// <summary>Records a document with its lines. Same number or idempotency key → the existing one comes back.</summary>
        Task<StoreDocumentSaveResult> SaveAsync(StoreDocumentInput input);

        /// <summary>One document with its lines, or null.</summary>
        Task<StoreDocumentDto?> GetAsync(string documentType, string documentNo);

        /// <summary>Marks a document Pending (to try again), Posted, Failed or Cancelled. Returns null when there is no such document.</summary>
        Task<StoreDocumentDto?> SetStatusAsync(string documentType, string documentNo, StoreDocumentStatusInput input);

        /// <summary>Newest first, without lines. All filters are optional.</summary>
        Task<List<StoreDocumentDto>> ListAsync(string? documentType, string? status, string? idempotencyKey, string? search, DateTime? from, DateTime? to, int take);
    }
}
