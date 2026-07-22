"use client"

import { FC, ReactNode, useState } from "react"
import { PlusIcon, XIcon } from "lucide-react"
import { motion } from "framer-motion"

import { cn } from "@/lib/utils"

const CONTAINER_SIZE = 260

interface FamilyButtonProps {
  children: React.ReactNode
  collapsedIcon?: React.ReactNode
  isSearching?: boolean
}

const FamilyButton: React.FC<FamilyButtonProps> = ({ children, collapsedIcon, isSearching }) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const toggleExpand = () => setIsExpanded(!isExpanded)

  return (
    <div
      className={cn(
        isExpanded
          ? "rounded-[24px] border border-black/10 shadow-sm dark:border-cyan-500/20 bg-gradient-to-b from-neutral-900 to-black w-[264px]"
          : "bg-transparent border-none shadow-none"
      )}
    >
      <div className={isExpanded ? "rounded-[23px] border border-black/10" : ""}>
        <div className={isExpanded ? "rounded-[22px] border dark:border-stone-800 border-white/50" : ""}>
          <div className={isExpanded ? "rounded-[21px] border border-neutral-950/20 flex items-center justify-center" : "flex items-center justify-center"}>
            <FamilyButtonContainer
              isExpanded={isExpanded}
              toggleExpand={toggleExpand}
              collapsedIcon={collapsedIcon}
              isSearching={isSearching}
            >
              {isExpanded ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{
                    opacity: 1,
                    transition: {
                      delay: 0.3,
                      duration: 0.4,
                      ease: "easeOut",
                    },
                  }}
                  style={{ width: "100%" }}
                >
                  {children}
                </motion.div>
              ) : null}
            </FamilyButtonContainer>
          </div>
        </div>
      </div>
    </div>
  )
}

// A container that wraps content and handles animations
interface FamilyButtonContainerProps {
  isExpanded: boolean
  toggleExpand: () => void
  children: ReactNode
  collapsedIcon?: ReactNode
  isSearching?: boolean
}

const FamilyButtonContainer: FC<FamilyButtonContainerProps> = ({
  isExpanded,
  toggleExpand,
  children,
  collapsedIcon,
  isSearching,
}) => {
  return (
    <motion.div
      className={cn(
        "relative flex flex-col items-center justify-center text-white cursor-pointer z-10 transition-all duration-300",
        !isExpanded
          ? "minimized-chatbot-circle hover:scale-105"
          : "p-4 border-white/10 border shadow-lg bg-gradient-to-b from-neutral-900 to-stone-900",
        (!isExpanded && isSearching) ? "minimized-widget-pulse" : ""
      )}
      layoutRoot
      layout
      initial={{ borderRadius: 28, width: "3.5rem", height: "3.5rem" }}
      animate={
        isExpanded
          ? {
              borderRadius: 20,
              width: CONTAINER_SIZE,
              height: CONTAINER_SIZE + 70, // Taller height to comfortably fit messages + input
              transition: {
                type: "spring",
                damping: 25,
                stiffness: 400,
                when: "beforeChildren",
              },
            }
          : {
              borderRadius: 28, // Round circle
              width: "3.5rem",  // 56px size
              height: "3.5rem",
            }
      }
      onClick={!isExpanded ? toggleExpand : undefined}
    >
      {isExpanded ? (
        <>
          {children}

          <motion.div
            className="absolute"
            initial={{ x: "-50%" }}
            animate={{ x: "0%" }}
            style={{ right: 12, bottom: 12 }}
          >
            <div
              className="p-[8px] group bg-neutral-800/50 dark:bg-black/50 border border-cyan-100/30 hover:border-neutral-200 text-orange-50 rounded-full shadow-2xl transition-colors duration-300"
              onClick={(e) => {
                e.stopPropagation()
                toggleExpand()
              }}
            >
              <XIcon
                className={cn(
                  "h-4 w-4 text-cyan-100/30 dark:text-neutral-400/80 group-hover:text-neutral-500 transition-colors duration-200"
                )}
              />
            </div>
          </motion.div>
        </>
      ) : (
        /* Center the collapsedIcon or PlusIcon directly in the container */
        <div className="flex items-center justify-center text-black">
          {collapsedIcon ? (
            <div className="h-5 w-5 flex items-center justify-center text-black">
              {collapsedIcon}
            </div>
          ) : (
            <PlusIcon className="h-5 w-5 text-black" />
          )}
        </div>
      )}
    </motion.div>
  )
}

export { FamilyButton }
export default FamilyButton
