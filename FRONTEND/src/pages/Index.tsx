import { Header } from '@/components/Header/Header';
import { TemplateList } from '@/components/TemplateList/TemplateList';
import { FolderList } from '@/components/FolderList/FolderList';
import { PointEditor } from '@/components/PointEditor/PointEditor';
import { Preview } from '@/components/Preview/Preview';
import { GenerateButton } from '@/components/GenerateButton/GenerateButton';

const Index = () => {
  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <Header />
      
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left panel - Controls */}
        <aside className="w-[380px] shrink-0 border-r border-border bg-background-secondary p-4 overflow-y-auto scrollbar-thin">
          <div className="space-y-4">
            <TemplateList />
            <FolderList />
            <GenerateButton />
          </div>
        </aside>

        {/* Right panel - Editor & Preview */}
        <main className="flex-1 p-4 overflow-hidden flex gap-4 min-w-0">
          <div className="flex-1 min-w-0 h-full">
            <PointEditor />
          </div>
          <div className="w-[400px] shrink-0 h-full">
            <Preview />
          </div>
        </main>
      </div>
    </div>
  );
};

export default Index;
