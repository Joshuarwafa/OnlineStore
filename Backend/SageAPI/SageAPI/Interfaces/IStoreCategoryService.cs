using SageAPI.Models;

namespace SageAPI.Interfaces
{
    public interface IStoreCategoryService
    {
        Task<List<StoreCategoryDto>> GetCategoriesAsync();
        Task<StoreCategoryDto> CreateCategoryAsync(CategoryCreateInput input);
        Task<StoreCategoryDto> UpdateCategoryAsync(int categoryId, CategoryUpdateInput input);
        Task DeleteCategoryAsync(int categoryId);

        Task<List<StoreItemDto>> GetItemsAsync();
        Task<int> UpdateItemsAsync(ItemsUpdateInput input);

        /// <summary>Checks an upload; with apply = true also saves it.</summary>
        Task<CategoryImportResult> ImportAsync(CategoryImportInput input, bool apply);
    }
}
