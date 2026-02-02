import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';

export function GraphControls() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button size="sm">Add node</Button>
        <Button size="sm" variant="outline">
          Add edge
        </Button>
        <Button size="sm" variant="ghost">
          Remove
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary">
          Undirected
        </Button>
        <Button size="sm" variant="outline">
          Directed
        </Button>
        <Separator orientation="vertical" className="mx-1 h-5" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline">
              Load preset
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem>K5</DropdownMenuItem>
            <DropdownMenuItem>K3,3</DropdownMenuItem>
            <DropdownMenuItem>Cube</DropdownMenuItem>
            <DropdownMenuItem>Grid</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Random planar</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline">
          Import JSON
        </Button>
        <Button size="sm" variant="outline">
          Export JSON
        </Button>
        <Button size="sm" variant="ghost">
          Clear
        </Button>
      </div>
    </div>
  );
}
