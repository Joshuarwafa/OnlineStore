namespace SageAPI.Models
{
    public class GLJournalBatch
    {
        public string BatchNumber { get; set; }
        public List<GLJournal> JournalEntries { get; set; } = new List<GLJournal>();
    }
}
