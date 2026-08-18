import type { BoxProps } from "@chakra-ui/react";
import type { PropsWithChildren } from "react";

export interface CardBaseProps extends PropsWithChildren {
  w?: BoxProps["width"];
  p?: BoxProps["padding"];
}
