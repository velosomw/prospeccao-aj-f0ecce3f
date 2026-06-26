import ReactECharts from "echarts-for-react";
import { Card, CardContent } from "@/components/ui/card";

interface ChartTileProps {
  option: any;
  height?: number;
}

const ChartTile = ({ option, height = 320 }: ChartTileProps) => (
  <Card className="overflow-hidden border-[hsl(217,91%,50%)]/20">
    <CardContent className="p-3">
      <ReactECharts
        option={option}
        style={{ height, width: "100%" }}
        opts={{ renderer: "canvas" }}
        notMerge
        lazyUpdate
      />
    </CardContent>
  </Card>
);

export default ChartTile;
